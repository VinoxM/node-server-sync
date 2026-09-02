import { formatDuration } from "#utils/humanUtil.js";
import { getMinioClient, splitMinioLink } from "#core/instance/minioClient.js";
import objectSizeHelperRep from "../repository/objectSizeHelperRep.js";
import storageSummaryRep from "../repository/storageSummaryRep.js";

/** 单次扫描数据库已处理/未处理对象的默认批量大小 */
const BUCKET_USAGE_DEFAULT_SCAN_BATCH_SIZE = 2000;

/** 并发查询 MinIO 对象 Stat 的单批次并发数 */
const STORAGE_STAT_DEFAULT_QUERY_BATCH = 10;

/** 批量回填对象大小的单批次事务阈值 */
const STORAGE_BACKFILL_OBJECT_SIZE_DEFAULT_BATCH = 100;

/** 存储统计数据自动清理的最小保留时长 (7 天) */
const EXPIRED_LIMITED = 1000 * 60 * 60 * 24 * 7;

/**
 * 执行多维度存储用量汇总统计定时任务
 * 1. 扫描各个业务表中未计算大小的记录，分批从 MinIO 拉取 Stat 并写回数据库
 * 2. 汇总各 Bucket 和全局的对象总数与总容量字节数
 * 3. 生成最新统计快照写入 `storage_summary` 表
 * 4. 执行历史快照数据的定期清理 (HouseKeep)
 * @returns {Promise<void>}
 */
export async function storageSummaryDimensions() {
    const options = __env.get('statistics.bucketUsage', {});
    const {
        backfillBatch = STORAGE_BACKFILL_OBJECT_SIZE_DEFAULT_BATCH,
        scanBatchSize = BUCKET_USAGE_DEFAULT_SCAN_BATCH_SIZE,
        statQueryBatch = STORAGE_STAT_DEFAULT_QUERY_BATCH
    } = options;
    const scanOptions = __env.get('statistics.scanOptions', []);
    if (__isEmptyArray(scanOptions)) return;

    /** @type {Map<string, string>} 存储桶维度使用量字典 (bucket -> totalBytesStr) */
    const bucketUsage = new Map();
    let totalCount = 0;

    for (const option of scanOptions) {
        await resolveUnprocessedBucketUsage(option, scanBatchSize, statQueryBatch, backfillBatch);
        const { total, buckets } = await calculateProcessedBucketUsage(option, scanBatchSize);
        Object.keys(buckets).forEach(b => {
            const size = buckets[b];
            const totalSize = bucketUsage.get(b) ?? '0';
            bucketUsage.set(b, sumSize(totalSize, size));
        });
        totalCount += total;
    }

    const totalSize = Array.from(bucketUsage.values()).reduce(sumSize, '0');
    const dimensions = { bucketUsage: Object.fromEntries(bucketUsage.entries()) };
    await storageSummaryRep.insertOne(totalCount, totalSize, dimensions);
    await doStaticsHouseKeep();
}

/**
 * 获取最新一条存储容量汇总快照及解析后的维度数据
 * @returns {Promise<{ id: number, totalCount: number, totalSize: string, dimensions: any, summaryAt: string }|null>}
 */
export async function getLatestStorageSummary() {
    const data = await storageSummaryRep.selectLatest();
    if (data) {
        return {
            ...data,
            dimensions: JSON.parse(data.dimensions ?? '{}')
        };
    }
    return null;
}

/**
 * 遍历已处理对象并统计按 Bucket 分类的总容量
 * @param {Object} [option={}] - 单个数据库的扫描配置
 * @param {string} option.dbName - 数据库名
 * @param {Array<{ tableName: string, linkColumn: string, sizeColumn: string, matchers?: string[] }>} [option.tables] - 表配置列表
 * @param {number} scanBatchSize - 分页扫描批次大小
 * @returns {Promise<{ total: number, buckets: Record<string, string> }>}
 */
async function calculateProcessedBucketUsage(option = {}, scanBatchSize) {
    const { dbName, tables = [] } = option;
    if (__isEmptyArray(tables)) return { total: 0, buckets: {} };
    const buckets = new Map();
    let total = 0;

    for (const { tableName, linkColumn, sizeColumn, matchers } of tables) {
        try {
            let lastId = 0;
            while (true) {
                const { rows, data } = await objectSizeHelperRep.selectProcessed(dbName, tableName, linkColumn, sizeColumn, matchers, lastId, scanBatchSize);
                if (rows === 0 || !Array.isArray(data) || data.length === 0) break;
                total += rows;
                lastId = data[data.length - 1].id;
                for (const { link, size } of data) {
                    const bucket = getMinioBucket(link);
                    const bucketSize = buckets.get(bucket) ?? '0';
                    buckets.set(bucket, sumSize(bucketSize, size));
                }
            }
        } catch (ex) {
            __log.error(`[Bucket Usage] Calculate database[${dbName}:${tableName}] processed object failed. Cause: `, ex.message);
            continue;
        }
    }
    return { total, buckets: Object.fromEntries(buckets) };
}

/**
 * 基于 BigInt 字符串安全相加两个大容量字节数（防止超大整数溢出）
 * @param {string|number} a - 加数 A
 * @param {string|number} b - 加数 B
 * @returns {string} 和的字符串表示
 */
function sumSize(a, b) {
    const numA = String(a || '0').split('.')[0];
    const numB = String(b || '0').split('.')[0];
    const num1 = BigInt(numA);
    const num2 = BigInt(numB);
    return (num1 + num2).toString();
}

/**
 * 扫描并批量处理指定配置下未计算文件大小的数据库记录
 * @param {Object} [option={}] - 扫描配置项
 * @param {number} scanBatchSize - 每次扫描条数
 * @param {number} statQueryBatch - 并发查询 MinIO 的批次大小
 * @param {number} backfillBatch - 批量更新数据库的批次大小
 */
async function resolveUnprocessedBucketUsage(option = {}, scanBatchSize, statQueryBatch, backfillBatch) {
    const { dbName, tables = [] } = option;
    if (__isEmptyArray(tables)) return;
    let handled = 0;

    for (const { tableName, linkColumn, sizeColumn, matchers } of tables) {
        try {
            let lastId = 0;
            while (true) {
                const { rows, data } = await objectSizeHelperRep.selectUnprocessed(dbName, tableName, linkColumn, sizeColumn, matchers, lastId, scanBatchSize);
                if (rows === 0 || !Array.isArray(data) || data.length === 0) break;
                lastId = data[data.length - 1].id;
                __log.info(`[Bucket Usage] Query database[${dbName}:${tableName}] unprocessed objects success, count: ${data.length}`);
                const resolved = await backfillUnprocessedObjectsSize(dbName, tableName, sizeColumn, data, statQueryBatch, backfillBatch);
                __log.info(`[Bucket Usage] Resolve database[${dbName}:${tableName}] unprocessed objects success, resolved: ${resolved}/${data.length}`);
                handled += resolved;
            }
        } catch (ex) {
            __log.error(`[Bucket Usage] Query database[${dbName}:${tableName}] unprocessed object failed. Cause: `, ex.message);
            continue;
        }
    }
    handled > 0 && __log.info(`[Bucket Usage] Resolved database[${dbName}] unprocessed object complete, handled: ${handled}.`);
}

/**
 * 批量从 MinIO 查询文件 Stat 并分块写入数据库
 * @param {string} dbName - 数据库名
 * @param {string} tableName - 表名
 * @param {string} sizeColumn - 文件大小字段名
 * @param {Array<{ id: number, link: string }>} [arr=[]] - 待处理对象数组
 * @param {number} statQueryBatch - MinIO 并发查询批次
 * @param {number} backfillBatch - 事务写入批次
 * @returns {Promise<number>} 成功回填条数
 */
async function backfillUnprocessedObjectsSize(dbName, tableName, sizeColumn, arr = [], statQueryBatch, backfillBatch) {
    let resolved = 0;
    if (__isEmptyArray(arr)) return resolved;
    let toBackfill = [];

    for (let i = 0; i < arr.length; i += statQueryBatch) {
        const toQuery = arr.slice(i, Math.min(i + statQueryBatch, arr.length));
        await Promise.all(toQuery.map(async data => {
            const { id, link } = data;
            const stat = await getStorageObjectStat(link);
            if (stat !== null) {
                toBackfill.push({ id, size: stat.size });
            }
        }));
        if (toBackfill.length > backfillBatch) {
            const result = await updateUnprocessedBatch(dbName, tableName, sizeColumn, toBackfill);
            result && (resolved += toBackfill.length);
            toBackfill = [];
        }
    }
    await updateUnprocessedBatch(dbName, tableName, sizeColumn, toBackfill);
    resolved += toBackfill.length;
    return resolved;
}

/**
 * 事务批量执行 UPDATE 语句回填对象大小
 * @param {string} dbName - 数据库名
 * @param {string} tableName - 表名
 * @param {string} sizeColumn - 字段名
 * @param {Array<{ id: number, size: number|string }>} [data=[]] - 待更新数据
 * @returns {Promise<boolean>}
 */
async function updateUnprocessedBatch(dbName, tableName, sizeColumn, data = []) {
    let result = true;
    if (__isEmptyArray(data)) return result;
    const sqlGenerator = (id, size) => `UPDATE ${tableName} SET ${sizeColumn}=${size} WHERE id=${id};`;
    const sql = data.map(d => sqlGenerator(d.id, d.size)).join("\n");
    await __sqliteDB.getTransactionDB(db => db.execute(sql), err => {
        result = false;
        __log.error(`[Bucket Usage] Execute database[${dbName}:${tableName}] backfill unprocessed objects size failed.`, err.message);
    }, dbName);
    result && __log.info(`[Bucket Usage] Execute database[${dbName}:${tableName}] backfill unprocessed objects size success. Resolved: ${data.length}`);
    return result;
}

/**
 * 历史统计快照数据定期清理 (HouseKeep)
 * @returns {Promise<void>}
 */
async function doStaticsHouseKeep() {
    const option = __env.get('statistics.houseKeep', { enable: false });
    if (!option.enable) return;
    const expire = __env.getEvaluate('statistics.houseKeep.expire', 0);
    if (expire < EXPIRED_LIMITED) {
        __log.warn(`[Statistics House Keep] Option expire ${expire} less than limited: ${EXPIRED_LIMITED}, house keep skipped.`);
        return;
    }
    const expireStr = formatDuration(expire);
    __log.info(`[Statistics House Keep] Ready to delete expired data from ${expireStr} ago.`);
    const { rows } = await storageSummaryRep.deleteExpiredData(expire);
    __log.info(`[Statistics House Keep] Cleaned up ${rows} data records dating back ${expireStr} from the present.`);
}

/**
 * 从 MinIO 获取指定对象的 Stat 状态
 * @param {string} minioLink - MinIO 资源路径
 * @returns {Promise<import('minio').BucketItemStat|null>}
 */
async function getStorageObjectStat(minioLink) {
    const client = getMinioClient();
    if (!client.ready()) {
        return null;
    }
    try {
        return await client.getObjectStat(minioLink);
    } catch (ignored) {
        return null;
    }
}

/**
 * 从 MinIO 资源路径中提取 Bucket 名称
 * @param {string} minioLink - 资源路径
 * @returns {string} 存储桶名称
 */
function getMinioBucket(minioLink) {
    return splitMinioLink(minioLink).bucket;
}