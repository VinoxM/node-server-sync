const dbName = 'rss'
const enablePrint = { print: true }

export default {
    selectByPid: (pid) => {
        const sql = "SELECT id,pid,title,href FROM rss_link WHERE pid=? ORDER BY id";
        return sqliteDB.selectAll(sql, [pid], enablePrint, dbName);
    },
    selectByPidV2: (pid) => {
        const sql = "SELECT title,href FROM rss_link WHERE pid=? ORDER BY id";
        return sqliteDB.selectAll(sql, [pid], null, dbName);
    },
    selectPidById: (id) => {
        const sql = "SELECT pid FROM rss_link WHERE id=?";
        return sqliteDB.selectOne(sql, [id], enablePrint, dbName).then(res => res.pid);
    },
    insertOne: (rssLink) => {
        const sql = "INSERT OR REPLACE INTO rss_link (pid, title, href) VALUES (?, ?, ?)";
        return sqliteDB.insert(sql, [rssLink.pid, rssLink.title, rssLink.href], enablePrint, dbName);
    },
    insertMany: (rssLinkArr, transactionDB) => {
        if (isEmptyArray(rssLinkArr)) return Promise.resolve();
        const params = [];
        let sql = "INSERT OR REPLACE INTO rss_link " +
            "(pid, title, href) " +
            "VALUES ";
        rssLinkArr.forEach(result => {
            sql += "(?, ?, ?),";
            params.push(result.pid, result.title, result.href);
        });
        sql = sql.substring(0, sql.length - 1);
        return (transactionDB || sqliteDB).insert(sql, params, enablePrint, dbName);
    },
    insertManyWithPid: (rssLinkArr, pid, transactionDB) => {
        if (isEmptyArray(rssLinkArr)) return Promise.resolve();
        const params = [];
        let sql = "INSERT OR REPLACE INTO rss_link " +
            "(pid, title, href) " +
            "VALUES ";
        rssLinkArr.forEach(result => {
            sql += "(?, ?, ?),";
            params.push(pid, result.title, result.href);
        });
        sql = sql.substring(0, sql.length - 1);
        return (transactionDB || sqliteDB).insert(sql, params, enablePrint, dbName);
    },
    updateOne: (rssLink) => {
        const sql = "UPDATE rss_link SET title=?,href=? WHERE id=?";
        return sqliteDB.update(sql, [rssLink.title, rssLink.href, rssLink.id], enablePrint, dbName);
    },
    deleteOne: (id) => {
        const sql = "DELETE FROM rss_link WHERE id=?";
        return sqliteDB.delete(sql, [id]);
    },
    deleteManyByPid: (pid, transactionDB) => {
        const sql = "DELETE FROM rss_link WHERE pid=?";
        return (transactionDB || sqliteDB).delete(sql, [pid], enablePrint, dbName);
    },
    deleteManyByPids: (pids, transactionDB) => {
        if (isEmptyArray(pids)) return Promise.resolve();
        const sql = `DELETE FROM rss_link WHERE pid IN (${pids.map(_ => "?").join(",")})`
        return (transactionDB || sqliteDB).delete(sql, pids, enablePrint, dbName);
    }
}