import { SUBSCRIBE_FIN_VALUE, SUBSCRIBE_GOON_VALUE } from "#modules/anime/constants/subjectConstant.js";
import { RSS_SUBSCRIBE_VECTOR_STATUS } from "#modules/anime/constants/rssSubscribeConsts.js";

const dbName = 'anime';

const FULL_COLUMNS = [
    'id',
    'bangumi_id',
    'start_time',
    'url',
    'regex',
    'fin',
    'goon'
];

const INSERT_COLUMNS_LENGTH = FULL_COLUMNS.length - 1; // Exclude 'id' column
const BATCH_INSERT_PARAMS_LIMIT = 500;

/**
 * 内部辅助方法：批量或单条插入订阅记录（若已存在相同 bangumi_id 则忽略）
 * @param {Array<any>} subscribes - 订阅对象数组
 * @returns {Promise<{ rows: number }|ExecResult>}
 */
async function insertAny(subscribes) {
    if (!subscribes || subscribes.length === 0) {
        return { rows: 0 };
    }
    const valueSql = `(${new Array(INSERT_COLUMNS_LENGTH + 1).fill('?').join(',')})`; // with 'vector_status' column
    const sql = `INSERT OR IGNORE INTO rss_subscribe (${FULL_COLUMNS.slice(1).join(',')}, vector_status) VALUES ${subscribes.map(() => valueSql).join(',')}`;
    const values = subscribes.flatMap(data => [
        data.bangumiId,
        data.startTime,
        data.url,
        data.regex,
        data.fin ?? SUBSCRIBE_FIN_VALUE.NO,
        data.goon ?? SUBSCRIBE_GOON_VALUE.NO,
        data.vectorStatus ?? RSS_SUBSCRIBE_VECTOR_STATUS.PREPARED
    ]);
    return __sqliteDB.insert(sql, values, null, dbName);
}

/**
 * 番剧 RSS 订阅源配置仓储服务
 */
export default {
    /**
     * 插入单条订阅记录
     * @param {Object} subscribe - 订阅数据
     * @param {number} subscribe.bangumiId - Bangumi 条目 ID
     * @param {string|Date} [subscribe.startTime] - 放送开始时间
     * @param {string} [subscribe.url] - RSS 抓取 URL
     * @param {string} [subscribe.regex] - 过滤规则正则表达式 JSON
     * @param {number} [subscribe.fin] - 完结状态 (0: 否, 1: 是)
     * @param {number} [subscribe.goon] - 跨季续播状态 (0: 否, 1: 是)
     * @returns {Promise<ExecResult>}
     */
    insertOne: (subscribe) => insertAny([subscribe]),

    /**
     * 批量插入订阅记录（自动分批处理防止参数超出 SQLite 限制）
     * @param {Array<any>} subscribes - 订阅数据列表
     * @returns {Promise<{ rows: number }|ExecResult>}
     */
    insertBatch: async (subscribes) => {
        const fullBatchSize = Math.floor(BATCH_INSERT_PARAMS_LIMIT / INSERT_COLUMNS_LENGTH);
        if (subscribes.length > fullBatchSize) {
            let totalInserted = 0;
            for (let i = 0; i < subscribes.length; i += fullBatchSize) {
                const batch = subscribes.slice(i, i + fullBatchSize);
                const { rows } = await insertAny(batch);
                totalInserted += rows;
            }
            return { rows: totalInserted };
        }
        return insertAny(subscribes);
    },

    /**
     * 更新指定 ID 的订阅配置信息
     * @param {Object} data - 订阅数据
     * @param {number} data.id - 主键 ID
     * @param {string|Date} data.startTime - 放送时间
     * @param {string} data.url - RSS 链接
     * @param {string} data.regex - 正则规则
     * @param {number} data.goon - 跨季续播标志
     * @returns {Promise<ExecResult>}
     */
    updateOne: (data) => {
        const sql = `UPDATE rss_subscribe SET start_time = ?, url = ?, regex = ?, goon = ? WHERE id = ?`;
        return __sqliteDB.update(sql, [
            data.startTime,
            data.url,
            data.regex,
            data.goon,
            data.id
        ], null, dbName);
    },

    /**
     * 根据 Bangumi ID 删除关联订阅
     * @param {number|string} bangumiId - Bangumi ID
     * @returns {Promise<ExecResult>}
     */
    deleteByBangumiId: (bangumiId) => {
        const sql = `DELETE FROM rss_subscribe WHERE bangumi_id = ?`;
        return __sqliteDB.delete(sql, [bangumiId], null, dbName);
    },

    /**
     * 根据 Subject ID 查询订阅详情及条目基本信息
     * @param {number|string} subjectId - Subject ID
     * @returns {Promise<{ id: number, bangumiId: number, startTime: string, url: string, regex: string, fin: number, goon: number, name: string, nameCN: string, nameAlias: string }|null>}
     */
    selectBySubjectId: (subjectId) => {
        const sql = `SELECT ${FULL_COLUMNS.map(c => 'rs.' + c).join(",")}, t.name, t.name_cn AS nameCN, t.name_alias FROM rss_subscribe rs `
            + `INNER JOIN subjects t ON t.bangumi_id = rs.bangumi_id `
            + `WHERE t.id=?`;
        return __sqliteDB.selectOne(sql, [subjectId], null, dbName);
    },

    /**
     * 根据 Bangumi ID 查询订阅详情
     * @param {number|string} bangumiId - Bangumi ID
     * @returns {Promise<{ id: number, bangumiId: number, startTime: string, url: string, regex: string, fin: number, goon: number }|null>}
     */
    selectByBangumiId: (bangumiId) => {
        const sql = `SELECT ${FULL_COLUMNS.join(",")} FROM rss_subscribe WHERE bangumi_id = ?`;
        return __sqliteDB.selectOne(sql, [bangumiId], null, dbName);
    },

    /**
     * 更新番剧订阅完结状态
     * @param {number|string} bangumiId - Bangumi ID
     * @param {number} fin - 完结状态 (SUBSCRIBE_FIN_VALUE: 0|1)
     * @returns {Promise<ExecResult>}
     */
    updateFinByBangumiId: (bangumiId, fin) => {
        const sql = `UPDATE rss_subscribe SET fin = ? WHERE bangumi_id = ?`;
        return __sqliteDB.update(sql, [fin, bangumiId], null, dbName);
    },

    /**
     * 查询指定向量状态的订阅记录 Bangumi ID 列表
     * @param {number} status - 查询向量状态
     * @param {number} [limited=500] - 单次查询条数上限
     * @returns {Promise<QueryResult<{ bangumiId: number }>>}
     */
    selectByVectorStatus: (status, limited = 500) => {
        const queryStatus = Object.values(RSS_SUBSCRIBE_VECTOR_STATUS).includes(status) ? status : RSS_SUBSCRIBE_VECTOR_STATUS.READY;
        return __sqliteDB.selectAll(`SELECT bangumi_id FROM rss_subscribe WHERE vector_status=? LIMIT ${limited}`, [queryStatus], null, dbName);
    },

    /**
     * 根据 Bangumi ID 集合查询非挂起 (PENDING) 状态的条目向量文本源数据
     * @param {Array<number|string>} bangumiIds - Bangumi ID 集合
     * @returns {Promise<QueryResult<{ bangumiId: number, name: string, nameCN: string, season: string, nameAlias: string, summary: string, summaryCN: string }>>}
     */
    selectForVectorByBangumiIds: (bangumiIds) => {
        const sql = `SELECT t.bangumi_id, t.name, t.name_cn AS nameCN, t.season, t.name_alias, t.summary, t.summary_cn AS summaryCN `
            + `FROM rss_subscribe rs `
            + `INNER JOIN subjects t ON rs.bangumi_id=t.bangumi_id `
            + `WHERE t.bangumi_id IN (${bangumiIds.map(() => '?').join(',')}) AND rs.vector_status!=? `;
        return __sqliteDB.selectAll(sql, [...bangumiIds, RSS_SUBSCRIBE_VECTOR_STATUS.PENDING], null, dbName);
    },

    /**
     * 批量重置指定 Bangumi ID 订阅记录的向量同步状态
     * @param {Array<number|string>} bangumiIds - Bangumi ID 集合
     * @returns {Promise<ExecResult>}
     */
    resetVectorStatusByBangumiIds: (bangumiIds) => {
        const sql = `UPDATE rss_subscribe AS rs `
            + `SET rs.vector_status = `
            + `CASE t.summary_cn `
            + `WHEN IS NULL THEN ${RSS_SUBSCRIBE_VECTOR_STATUS.PREPARED} `
            + `ELSE ${RSS_SUBSCRIBE_VECTOR_STATUS.READY} END FROM subjects t `
            + `WHERE rs.bangumi_id IN (${bangumiIds.map(() => '?').join(',')})`
        return __sqliteDB.update(sql, bangumiIds, null, dbName);
    },

    /**
     * 批量更新指定 Bangumi ID 订阅记录的向量同步状态
     * @param {Array<number|string>} bangumiIds - Bangumi ID 集合
     * @param {number} status - 向量同步状态 (RSS_SUBSCRIBE_VECTOR_STATUS)
     * @returns {Promise<ExecResult>}
     */
    updateVectorStatusByBangumiIds: (bangumiIds, status) => {
        return __sqliteDB.update(`UPDATE rss_subscribe SET vector_status=? WHERE bangumi_id IN (${bangumiIds.map(() => '?').join(',')})`, [status, ...bangumiIds], null, dbName);
    },
};