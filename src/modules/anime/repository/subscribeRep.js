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

async function insertAny(subscribes) {
    if (!subscribes || subscribes.length === 0) {
        return { rows: 0 };
    }
    const valueSql = `(${new Array(FULL_COLUMNS.length - 1).fill('?').join(',')})`;
    const sql = `INSERT OR IGNORE INTO rss_subscribe (${FULL_COLUMNS.slice(1).join(',')}) VALUES ${subscribes.map(() => valueSql).join(',')}`;
    const values = subscribes.flatMap(data => [
        data.bangumiId,
        data.startTime,
        data.url,
        data.regex,
        data.fin ?? SUBSCRIBE_FIN_VALUE.NO,
        data.goon ?? SUBSCRIBE_GOON_VALUE.NO
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
     * @param {string} [subscribe.startTime] - 放送开始时间
     * @param {string} [subscribe.url] - RSS 抓取 URL
     * @param {string} [subscribe.regex] - 过滤规则正则表达式 JSON
     * @param {number} [subscribe.fin] - 完结状态
     * @param {number} [subscribe.goon] - 跨季续播状态
     * @returns {Promise<ExecResult>}
     */
    insertOne: (subscribe) => insertAny([subscribe]),

    /**
     * 批量插入订阅记录
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
     * 更新指定 Bangumi ID 的订阅配置信息
     * @param {Object} data - 订阅数据
     * @param {number} data.id - 主键 ID
     * @param {string} data.startTime - 放送时间
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
     * @param {number} bangumiId - Bangumi ID
     * @returns {Promise<ExecResult>}
     */
    deleteByBangumiId: (bangumiId) => {
        const sql = `DELETE FROM rss_subscribe WHERE bangumi_id = ?`;
        return __sqliteDB.delete(sql, [bangumiId], null, dbName);
    },

    /**
     * 根据 Subject ID 查询订阅详情
     * @param {number} subjectId - Subject ID
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
     * @param {number} bangumiId - Bangumi ID
     * @returns {Promise<{ id: number, bangumiId: number, startTime: string, url: string, regex: string, fin: number, goon: number }|null>}
     */
    selectByBangumiId: (bangumiId) => {
        const sql = `SELECT ${FULL_COLUMNS.join(",")} FROM rss_subscribe WHERE bangumi_id = ?`;
        return __sqliteDB.selectOne(sql, [bangumiId], null, dbName);
    },

    /**
     * 更新番剧订阅完结状态
     * @param {number} bangumiId - Bangumi ID
     * @param {number} fin - 完结状态 (SUBSCRIBE_FIN_VALUE: 0|1)
     * @returns {Promise<ExecResult>}
     */
    updateFinByBangumiId: (bangumiId, fin) => {
        const sql = `UPDATE rss_subscribe SET fin = ? WHERE bangumi_id = ?`;
        return __sqliteDB.update(sql, [fin, bangumiId], null, dbName);
    },

    selectReadyVectors: (limited = 500) => {
        return __sqliteDB.selectAll(`SELECT bangumi_id FROM rss_subscribe WHERE vector_status=? LIMIT ${limited}`, [RSS_SUBSCRIBE_VECTOR_STATUS.READY], null, dbName);
    },

    selectForVectorByBangumiIds: (bangumiIds) => {
        const sql = `SELECT t.bangumi_id, t.name, t.name_cn AS nameCN, t.season, t.name_alias, t.summary, t.summary_cn AS summaryCN `
            + `FROM rss_subscribe rs `
            + `INNER JOIN subjects t ON rs.bangumi_id=t.bangumi_id `
            + `WHERE t.bangumi_id IN (${bangumiIds.map(() => '?').join(',')}) AND rs.vector_status!=? `;
        return __sqliteDB.selectAll(sql, [...bangumiIds, RSS_SUBSCRIBE_VECTOR_STATUS.PENDING], null, dbName)
    },

    updateVectorStatusByBangumiIds: (bangumiIds, status) => {
        return __sqliteDB.update(`UPDATE rss_subscribe SET vector_status=? WHERE bangumi_id IN (${bangumiIds.map(() => '?').join(',')})`, [status, ...bangumiIds], null, dbName)
    },
};