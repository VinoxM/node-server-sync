import { formatFileSize } from "../../../common/utils/humanUtil.js";
import { getMinioClient, splitMinioLink } from "../../../core/instance/minioClient.js";
import objectSizeHelperRep from "../repository/objectSizeHelperRep.js";
import storageSummaryRep from "../repository/storageSummaryRep.js";

const BUCKET_USAGE_DEFAULT_SCAN_BATCH_SIZE = 2000;
const STORAGE_STAT_DEFAULT_QUERY_BATCH = 10;
const STORAGE_BACKFILL_OBJECT_SIZE_DEFAULT_BATCH = 100;

export async function storageSummaryDimensions() {
    const options = __env.get('statistics.bucketUsage', {});
    const {
        backfillBatch = STORAGE_BACKFILL_OBJECT_SIZE_DEFAULT_BATCH,
        scanBatchSize = BUCKET_USAGE_DEFAULT_SCAN_BATCH_SIZE,
        statQueryBatch = STORAGE_STAT_DEFAULT_QUERY_BATCH
    } = options
    const scanOptions = __env.get('statistics.scanOptions', []);
    if (__isEmptyArray(scanOptions)) return;
    const bucketUsage = new Map();
    let totalCount = 0;
    for (const option of scanOptions) {
        await resolveUnprocessedBucketUsage(option, scanBatchSize, statQueryBatch, backfillBatch);
        const { total, buckets } = await calculateProcessedBucketUsage(option, scanBatchSize);
        Object.keys(buckets).forEach(b => {
            const size = buckets[b]
            const totalSize = bucketUsage.get(b) ?? '0'
            bucketUsage.set(b, sumSize(totalSize, size))
        })
        totalCount += total;
    }
    const totalSize = Array.from(bucketUsage.values()).reduce(sumSize, '0')
    const dimensions = { bucketUsage: Object.fromEntries(bucketUsage.entries()) }
    await storageSummaryRep.insertOne(totalCount, totalSize, dimensions);
}

export async function getLatestStorageSummary() {
    const data = await storageSummaryRep.selectLatest()
    if (data) {
        return {
            ...data,
            dimensions: JSON.parse(data.dimensions ?? {})
        }
    }
    return null;
}

async function calculateProcessedBucketUsage(option = {}, scanBatchSize) {
    const { dbName, tables = [] } = option
    if (__isEmptyArray(tables)) return {};
    const buckets = new Map();
    let total = 0;
    for (const { tableName, linkColumn, sizeColumn, matchers } of tables) {
        try {
            let lastId = 0;
            while (true) {
                const { rows, data } = await objectSizeHelperRep.selectProcessed(dbName, tableName, linkColumn, sizeColumn, matchers, lastId, scanBatchSize)
                if (rows === 0 || !Array.isArray(data) || data.length === 0) break;
                total += rows;
                lastId = data[data.length - 1].id
                for (const { link, size } of data) {
                    const bucket = getMinioBucket(link);
                    const bucketSize = buckets.get(bucket) ?? '0'
                    buckets.set(bucket, sumSize(bucketSize, size))
                }
            }
        } catch (ex) {
            __log.error(`[Bucket Usage] Calculate database[${dbName}:${tableName}] processed object failed. Cause: `, ex.message);
            continue;
        }
    }
    return { total, buckets: Object.fromEntries(buckets) }
}

function sumSize(a, b) {
    const num1 = BigInt(a || '0');
    const num2 = BigInt(b || '0');
    return (num1 + num2).toString();
}

async function resolveUnprocessedBucketUsage(option = {}, scanBatchSize, statQueryBatch, backfillBatch) {
    const { dbName, tables = [] } = option
    if (__isEmptyArray(tables)) return;
    let handled = 0;
    for (const { tableName, linkColumn, sizeColumn, matchers } of tables) {
        try {
            let lastId = 0;
            while (true) {
                const { rows, data } = await objectSizeHelperRep.selectUnprocessed(dbName, tableName, linkColumn, sizeColumn, matchers, lastId, scanBatchSize)
                if (rows === 0 || !Array.isArray(data) || data.length === 0) break;
                lastId = data[data.length - 1].id
                __log.info(`[Bucket Usage] Query database[${dbName}:${tableName}] unprocessed objects success, count: ${data.length}`)
                const resolved = await backfillUnprocessedObjectsSize(dbName, tableName, sizeColumn, data, statQueryBatch, backfillBatch);
                __log.info(`[Bucket Usage] Resolve database[${dbName}:${tableName}] unprocessed objects success, resolved: ${resolved}/${data.length}`)
                handled += resolved
            }
        } catch (ex) {
            __log.error(`[Bucket Usage] Query database[${dbName}:${tableName}] unprocessed object failed. Cause: `, ex.message);
            continue;
        }
    }
    handled > 0 && __log.info(`[Bucket Usage] Resolved database[${dbName}] unprocessed object complete, handled: ${handled}.`);
}

async function backfillUnprocessedObjectsSize(dbName, tableName, sizeColumn, arr = [], statQueryBatch, backfillBatch) {
    let resolved = 0;
    if (__isEmptyArray(arr)) return resolved;
    let toBackfill = [];
    for (let i = 0; i < arr.length; i += statQueryBatch) {
        const toQuery = arr.slice(i, Math.min(i + statQueryBatch, arr.length))
        await Promise.all(toQuery.map(async data => {
            const { id, link } = data;
            const stat = await getStorageObjectStat(link)
            if (stat !== null) {
                toBackfill.push({ id, size: stat.size })
            }
        }))
        if (toBackfill.length > backfillBatch) {
            const result = await updateUnprocessedBatch(dbName, tableName, sizeColumn, toBackfill)
            result && (resolved += toBackfill.length)
            toBackfill = []
        }
    }
    await updateUnprocessedBatch(dbName, tableName, sizeColumn, toBackfill);
    resolved += toBackfill.length;
    return resolved
}

async function updateUnprocessedBatch(dbName, tableName, sizeColumn, data = []) {
    let result = true;
    if (__isEmptyArray(data)) return result;
    const sqlGenerator = (id, size) => `UPDATE ${tableName} SET ${sizeColumn}=${size} WHERE id=${id};`
    const sql = data.map(d => sqlGenerator(d.id, d.size)).join("\n");
    await __sqliteDB.getTransactionDB(db => db.execute(sql), err => {
        result = false;
        __log.error(`[Bucket Usage] Execute database[${dbName}:${tableName}] backfill unprocessed objects size failed.`, err.message)
    }, dbName);
    result && __log.info(`[Bucket Usage] Execute database[${dbName}:${tableName}] backfill unprocessed objects size success. Resolved: ${data.length}`)
    return result
}

async function getStorageObjectStat(minioLink) {
    const client = getMinioClient()
    if (!client.ready()) {
        return null;
    }
    try {
        return await client.getObjectStat(minioLink)
    } catch (ignored) {
        return null;
    }
}

function getMinioBucket(minioLink) {
    return splitMinioLink(minioLink).bucket
}