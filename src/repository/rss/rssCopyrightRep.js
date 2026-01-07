const dbName = 'rss'
const enablePrint = { print: true }

export default {
    selectByPid: (pid) => {
        const sql = "SELECT id,pid,area,href,image FROM rss_copyright WHERE pid=? ORDER BY id";
        return sqliteDB.selectAll(sql, [pid], enablePrint, dbName);
    },
    selectByPidV2: (pid) => {
        const sql = "SELECT area,href,image FROM rss_copyright WHERE pid=? ORDER BY id";
        return sqliteDB.selectAll(sql, [pid], null, dbName);
    },
    selectPidById: (id) => {
        const sql = "SELECT pid FROM rss_copyright WHERE id=?";
        return sqliteDB.selectOne(sql, [id], enablePrint, dbName).then(res => res.pid);
    },
    insertOne: (rssCopyright) => {
        const sql = "INSERT INTO rss_copyright (pid, area, href, image) VALUES (?, ?, ?, ?)";
        return sqliteDB.insert(sql, [rssCopyright.pid, rssCopyright.area, rssCopyright.href, rssCopyright.image], enablePrint, dbName);
    },
    insertMany: (rssCopyrightArr, transactionDB) => {
        if (isEmptyArray(rssCopyrightArr)) return Promise.resolve();
        const params = [];
        let sql = "INSERT OR REPLACE INTO rss_copyright " +
            "(pid, area, href, image) " +
            "VALUES ";
        rssCopyrightArr.forEach(result => {
            sql += "(?, ?, ?, ?),";
            params.push(result.pid, result.area, result.href, result.image);
        });
        sql = sql.substring(0, sql.length - 1);
        return (transactionDB || sqliteDB).insert(sql, params, enablePrint, dbName);
    },
    insertManyWithPid: (rssCopyrightArr, pid, transactionDB) => {
        if (isEmptyArray(rssCopyrightArr)) return Promise.resolve();
        const params = [];
        let sql = "INSERT OR REPLACE INTO rss_copyright " +
            "(pid, area, href, image) " +
            "VALUES ";
        rssCopyrightArr.forEach(result => {
            sql += "(?, ?, ?, ?),";
            params.push(pid, result.area, result.href, result.image);
        });
        sql = sql.substring(0, sql.length - 1);
        return (transactionDB || sqliteDB).insert(sql, params, enablePrint, dbName);
    },
    updateOne: (rssCopyright) => {
        const sql = "UPDATE rss_copyright SET area=?,href=?,image=? WHERE id=?";
        return sqliteDB.update(sql, [rssCopyright.area, rssCopyright.href, rssCopyright.image, rssCopyright.id], enablePrint, dbName);
    },
    deleteOne: (id) => {
        const sql = "DELETE FROM rss_copyright WHERE id=?";
        return sqliteDB.delete(sql, [id], enablePrint, dbName);
    },
    deleteManyByPid: (pid, transactionDB) => {
        const sql = "DELETE FROM rss_copyright WHERE pid=?";
        return (transactionDB || sqliteDB).delete(sql, [pid], enablePrint, dbName);
    },
    deleteManyByPids: (pids, transactionDB) => {
        if (isEmptyArray(pids)) return Promise.resolve();
        const sql = `DELETE FROM rss_copyright WHERE pid IN (${pids.map(_ => "?").join(",")})`;
        return (transactionDB || sqliteDB).delete(sql, pids, enablePrint, dbName);
    },
    selectAllImage: () => {
        const sql = "SELECT image FROM rss_copyright GROUP BY image";
        return sqliteDB.selectAll(sql, [], enablePrint, dbName).then(res => res.data.map(obj => obj.image));
    }
}