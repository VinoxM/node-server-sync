import { dateFormatForDB, dateFormatFor30Hours } from "../../common/dateUtil.js";

const dbName = 'rss'
const enablePrint = { print: true }

export default {
    selectMaxId: () => {
        const sql = "SELECT MAX(id) id FROM rss_result"
        return sqliteDB.selectOne(sql, [], null, dbName).then(data => data?.id || 0);
    },
    insertOne: (result) => {
        let sql = "INSERT OR IGNORE INTO rss_result" +
            "(id, pid, title, torrent, pub_date, tracker, episode, up_date, sort) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        const params = [result.id, result.pid, result.title, result.torrent, dateFormatForDB(result.pubDate), result.tracker, result.episode, dateFormatFor30Hours(result.pubDate), result.sort];
        return sqliteDB.insert(sql, params, enablePrint, dbName);
    },
    insertMany: (resultArr) => {
        if (isEmptyArray(resultArr)) return Promise.resolve();
        let sql = "INSERT OR IGNORE INTO rss_result" +
            "(id, pid, title, torrent, pub_date, tracker, episode, up_date, sort) " +
            "VALUES ";
        const params = [];
        resultArr.forEach(result => {
            sql += "(?, ?, ?, ?, ?, ?, ?, ?, ?),";
            params.push(result.id, result.pid, result.title, result.torrent, dateFormatForDB(result.pubDate), result.tracker, result.episode, dateFormatFor30Hours(result.pubDate), result.sort);
        });
        sql = sql.substring(0, sql.length - 1);
        return sqliteDB.insert(sql, params, null, dbName);
    },
    updateOne: (result) => {
        const sql = "UPDATE rss_result SET title=?,torrent=?,pub_date=?,tracker=?,episode=?, up_date=?, sort=? WHERE id=?";
        return sqliteDB.update(sql, [result.title, result.torrent, result.pubDate, result.tracker, result.episode, dateFormatFor30Hours(result.pubDate), result.sort, result.id], enablePrint, dbName);
    },
    deleteOneById: (id) => {
        const sql = "DELETE FROM rss_result WHERE id = ?";
        return sqliteDB.delete(sql, [id], enablePrint, dbName);
    },
    deleteByPid: (pid, transactionDB) => {
        const sql = 'DELETE FROM rss_result WHERE pid = ?';
        const db = transactionDB || sqliteDB;
        return db.delete(sql, [pid], enablePrint, dbName);
    },
    deleteByPids: (pids, transactionDB) => {
        if (isEmptyArray(pids)) return Promise.resolve();
        const sql = `DELETE FROM rss_result WHERE pid IN (${pids.map(_ => "?").join(",")})`;
        const db = transactionDB || sqliteDB;
        return db.delete(sql, pids, enablePrint, dbName);
    },
    fakeDeleteOneById: (id, hide) => {
        const sql = "UPDATE rss_result SET hide = ? WHERE id = ?";
        return sqliteDB.update(sql, [hide, id], enablePrint, dbName);
    }
}