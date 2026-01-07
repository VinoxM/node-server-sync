let trackerCache = null

const dbName = 'rss'
const enablePrint = { print: true }

export default {
    selectAll: (print = true, replaceCache = false) => {
        const sql = "SELECT id,host FROM rss_tracker";
        if (trackerCache) {
            return Promise.resolve({ rows: trackerCache.length, data: JSON.parse(JSON.stringify(trackerCache)) })
        }
        const returning = sqliteDB.selectAll(sql, [], print ? enablePrint : null, dbName);
        return returning.then(res => {
            if (replaceCache || !trackerCache) {
                trackerCache = JSON.parse(JSON.stringify(res.data))
            }
            return res;
        });
    },
    selectMaxId: () => {
        const sql = "SELECT MAX(id) id FROM rss_tracker";
        return sqliteDB.selectOne(sql, [], null, dbName).then(data => data?.id || 0);
    },
    insertManyWithId: (rssTrackers, transactionDB) => {
        if (!rssTrackers || rssTrackers.length === 0) return Promise.resolve({ rows: 0 });
        const db = transactionDB || sqliteDB;
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