import { dateFormatForDB } from '../../../common/utils/dateUtil.js';

const dbName = 'anime'
const enablePrint = { print: true }

export default {
    selectMaxId: () => {
        const sql = "SELECT MAX(id) id FROM rss_result"
        return __sqliteDB.selectOne(sql, [], null, dbName).then(data => data?.id || 0);
    },
    insertOne: (result) => {
        let sql = "INSERT OR IGNORE INTO rss_result" +
            "(id, pid, title, torrent, pub_date, tracker, episode, sort) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        const params = [result.id, result.pid, result.title, result.torrent, dateFormatForDB(result.pubDate), result.tracker, result.episode, result.sort];
        return __sqliteDB.insert(sql, params, enablePrint, dbName);
    },
    insertMany: (resultArr) => {
        if (__isEmptyArray(resultArr)) return Promise.resolve();
        let sql = "INSERT OR IGNORE INTO rss_result" +
            "(id, pid, title, torrent, pub_date, tracker, episode, sort) " +
            "VALUES ";
        const params = [];
        resultArr.forEach(result => {
            sql += "(?, ?, ?, ?, ?, ?, ?, ?),";
            params.push(result.id, result.pid, result.title, result.torrent, dateFormatForDB(result.pubDate), result.tracker, result.episode, result.sort);
        });
        sql = sql.substring(0, sql.length - 1);
        return __sqliteDB.insert(sql, params, null, dbName);
    },
    updateOne: (result) => {
        const sql = "UPDATE rss_result SET title=?,torrent=?,pub_date=?,tracker=?,episode=?, sort=? WHERE id=?";
        return __sqliteDB.update(sql, [result.title, result.torrent, result.pubDate, result.tracker, result.episode, result.sort, result.id], enablePrint, dbName);
    },
    deleteOneById: (id) => {
        const sql = "DELETE FROM rss_result WHERE id = ?";
        return __sqliteDB.delete(sql, [id], enablePrint, dbName);
    },
    deleteByPid: (pid, transactionDB) => {
        const sql = 'DELETE FROM rss_result WHERE pid = ?';
        const db = transactionDB || __sqliteDB;
        return db.delete(sql, [pid], enablePrint, dbName);
    },
    deleteByPids: (pids, transactionDB) => {
        if (__isEmptyArray(pids)) return Promise.resolve();
        const sql = `DELETE FROM rss_result WHERE pid IN (${pids.map(_ => "?").join(",")})`;
        const db = transactionDB || __sqliteDB;
        return db.delete(sql, pids, enablePrint, dbName);
    },
    fakeDeleteOneById: (id, hide) => {
        const sql = "UPDATE rss_result SET hide = ? WHERE id = ?";
        return __sqliteDB.update(sql, [hide, id], enablePrint, dbName);
    },
    selectOneForTaskByIdAndPid: (id, pid) => {
        const sql = 'SELECT rr.id, rr.pid, rr.torrent, rr.tracker, rs.name title FROM rss_result rr ' +
            'INNER JOIN rss_subscribe rs ON rr.pid=rs.id ' +
            'WHERE rr.id=? AND rr.pid=?'
        return __sqliteDB.selectOne(sql, [id, pid], null, dbName);
    },
    selectResultTitleById: (id) => {
        const sql = 'SELECT title FROM rss_result WHERE id=?'
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },
    /** Newest */
    selectRssResultsByPid: (pid) => {
        const sql = "SELECT id, title,torrent,pub_date,tracker,episode FROM rss_result WHERE pid=? AND hide=0 ORDER BY sort";
        return __sqliteDB.selectAll(sql, [pid], null, dbName);
    },
}