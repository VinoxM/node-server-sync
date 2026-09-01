import { tryClone } from "../../../common/utils/objectUtil.js";

let trackerCache = null

const dbName = 'anime'
const enablePrint = { print: true }

async function selectAllTrackers(print = true, replaceCache = false) {
    const sql = "SELECT id,host FROM rss_tracker";
    if (trackerCache) {
        return Promise.resolve({ rows: trackerCache.length, data: tryClone(trackerCache) })
    }
    const returning = __sqliteDB.selectAll(sql, [], print ? enablePrint : null, dbName);
    return returning.then(res => {
        if (replaceCache || !trackerCache) {
            trackerCache = tryClone(res.data)
        }
        return res;
    });
}

export default {
    selectAll: (print = true, replaceCache = false) => selectAllTrackers(print, replaceCache),
    selectHostsByIds: async ids => {
        if (__isEmptyArray(ids)) return [];
        const { data } = await selectAllTrackers(false);
        return data.filter(({ id }) => ids.includes(id + '')).map(({ host }) => host);
    },
    selectMaxId: () => {
        const sql = "SELECT MAX(id) id FROM rss_tracker";
        return __sqliteDB.selectOne(sql, [], null, dbName).then(data => data?.id || 0);
    },
    insertManyWithId: (rssTrackers, transactionDB) => {
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
                this.selectAll(true, true)
            }
            return res
        });
    }
}