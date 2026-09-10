import { tryClone } from '#utils/objectUtil.js';

let trackerCache = null;
const trackerMapping = new Map();

const dbName = 'anime';

async function selectAllTrackers(replaceCache = false) {
    const sql = "SELECT id,host FROM rss_tracker";
    if (trackerCache) {
        return Promise.resolve({ rows: trackerCache.length, data: tryClone(trackerCache) });
    }
    const returning = __sqliteDB.selectAll(sql, [], null, dbName);
    return returning.then(res => {
        if (replaceCache || !trackerCache) {
            trackerCache = tryClone(res.data);
            trackerMapping.clear();
            trackerCache.forEach(item => trackerMapping.set(item.id, item.host));
        }
        return res;
    });
}

/**
 * BitTorrent Tracker 服务器列表仓储服务
 */
export default {

    getTrackersMapping: async () => {
        if (!trackerCache) {
            await selectAllTrackers(true);
        }
        return Object.fromEntries(trackerMapping.entries())
    },

    /**
     * 查询全部 Tracker 服务器（支持内存缓存）
     * @param {boolean} [replaceCache=false] - 是否强制更新缓存
     * @returns {Promise<QueryResult<{ id: number, host: string }>>}
     */
    selectAll: (replaceCache = false) => selectAllTrackers(replaceCache),

    /**
     * 根据 Tracker ID 列表获取对应的 Host 地址列表
     * @param {string[]} ids - Tracker ID 数组
     * @returns {Promise<string[]>}
     */
    selectHostsByIds: async ids => {
        if (__isEmptyArray(ids)) return [];
        const { data } = await selectAllTrackers();
        return data.filter(({ id }) => ids.includes(id + '')).map(({ host }) => host);
    },

    /**
     * 获取最大 Tracker ID
     * @returns {Promise<number>}
     */
    selectMaxId: async () => {
        const sql = "SELECT MAX(id) id FROM rss_tracker";
        return __sqliteDB.selectOne(sql, [], null, dbName).then(data => data?.id || 0);
    },

    /**
     * 批量插入 Tracker 列表
     * @param {Array<{ id: number, host: string }>} rssTrackers - Tracker 列表
     * @param {TransactionDB} [transactionDB] - 可选的事务句柄
     * @returns {Promise<ExecResult>}
     */
    insertManyWithId: async (rssTrackers, transactionDB) => {
        if (!rssTrackers || rssTrackers.length === 0) return Promise.resolve({ rows: 0 });
        const db = transactionDB || __sqliteDB;
        let sql = "INSERT OR IGNORE INTO rss_tracker(id, host) VALUES ";
        const params = [];
        rssTrackers.forEach(tr => {
            sql += "(?, ?),";
            params.push(tr.id);
            params.push(tr.host);
        });
        sql = sql.substring(0, sql.length - 1);
        return db.insert(sql, params, null, dbName).then(res => {
            if (res.rows) {
                selectAllTrackers(true);
            }
            return res;
        });
    }
};