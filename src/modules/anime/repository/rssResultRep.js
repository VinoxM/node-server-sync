import { dateFormatForDB } from '#utils/dateUtil.js';

const dbName = 'anime';
const enablePrint = { print: true };

/**
 * RSS 抓取条目结果仓储服务
 */
export default {
    /**
     * 获取当前结果表最大主键 ID
     * @returns {Promise<number>}
     */
    selectMaxId: () => {
        const sql = "SELECT MAX(id) id FROM rss_result";
        return __sqliteDB.selectOne(sql, [], null, dbName).then(data => data?.id || 0);
    },

    /**
     * 插入单条 RSS 抓取条目
     * @param {Object} result - 条目数据
     * @returns {Promise<ExecResult>}
     */
    insertOne: (result) => {
        let sql = "INSERT OR IGNORE INTO rss_result" +
            "(id, pid, title, torrent, pub_date, tracker, episode, sort) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        const params = [result.id, result.pid, result.title, result.torrent, dateFormatForDB(result.pubDate), result.tracker, result.episode, result.sort];
        return __sqliteDB.insert(sql, params, enablePrint, dbName);
    },

    /**
     * 批量插入 RSS 抓取条目列表
     * @param {Array<any>} resultArr - 条目数组
     * @returns {Promise<ExecResult|void>}
     */
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

    /**
     * 更新单条抓取条目
     * @param {Object} result - 条目数据
     * @returns {Promise<ExecResult>}
     */
    updateOne: (result) => {
        const sql = "UPDATE rss_result SET title=?,torrent=?,pub_date=?,tracker=?,episode=?, sort=? WHERE id=?";
        return __sqliteDB.update(sql, [result.title, result.torrent, result.pubDate, result.tracker, result.episode, result.sort, result.id], enablePrint, dbName);
    },

    /**
     * 物理删除指定条目
     * @param {number} id - 条目 ID
     * @returns {Promise<ExecResult>}
     */
    deleteOneById: (id) => {
        const sql = "DELETE FROM rss_result WHERE id = ?";
        return __sqliteDB.delete(sql, [id], enablePrint, dbName);
    },

    /**
     * 根据订阅 ID 删除其下所有结果
     * @param {number} pid - 订阅 ID
     * @param {TransactionDB} [transactionDB] - 可选的事务句柄
     * @returns {Promise<ExecResult>}
     */
    deleteByPid: (pid, transactionDB) => {
        const sql = 'DELETE FROM rss_result WHERE pid = ?';
        const db = transactionDB || __sqliteDB;
        return db.delete(sql, [pid], enablePrint, dbName);
    },

    /**
     * 批量根据订阅 ID 列表删除结果条目
     * @param {number[]} pids - 订阅 ID 列表
     * @param {TransactionDB} [transactionDB] - 可选的事务句柄
     * @returns {Promise<ExecResult|void>}
     */
    deleteByPids: (pids, transactionDB) => {
        if (__isEmptyArray(pids)) return Promise.resolve();
        const sql = `DELETE FROM rss_result WHERE pid IN (${pids.map(_ => "?").join(",")})`;
        const db = transactionDB || __sqliteDB;
        return db.delete(sql, pids, enablePrint, dbName);
    },

    /**
     * 逻辑隐藏或显示指定结果条目
     * @param {number} id - 条目 ID
     * @param {number} hide - 隐藏值 (0 或 1)
     * @returns {Promise<ExecResult>}
     */
    fakeDeleteOneById: (id, hide) => {
        const sql = "UPDATE rss_result SET hide = ? WHERE id = ?";
        return __sqliteDB.update(sql, [hide, id], enablePrint, dbName);
    },

    /**
     * 查询条目用于创建下载任务
     * @param {number} id - 条目 ID
     * @param {number} pid - 订阅 ID
     * @returns {Promise<{ id: number, pid: number, torrent: string, tracker: string, title: string }|null>}
     */
    selectOneForTaskByIdAndPid: (id, pid) => {
        const sql = 'SELECT rr.id, rr.pid, rr.torrent, rr.tracker, rs.name title FROM rss_result rr ' +
            'INNER JOIN rss_subscribe rs ON rr.pid=rs.id ' +
            'WHERE rr.id=? AND rr.pid=?';
        return __sqliteDB.selectOne(sql, [id, pid], null, dbName);
    },

    /**
     * 查询条目标题
     * @param {number} id - 条目 ID
     * @returns {Promise<{ title: string }|null>}
     */
    selectResultTitleById: (id) => {
        const sql = 'SELECT title FROM rss_result WHERE id=?';
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 查询指定订阅下未隐藏的所有抓取条目（按集数序号升序）
     * @param {number} pid - 订阅 ID
     * @returns {Promise<QueryResult<{ id: number, title: string, torrent: string, pubDate: string, tracker: string, episode: number }>>}
     */
    selectRssResultsByPid: (pid) => {
        const sql = "SELECT id, title,torrent,pub_date,tracker,episode FROM rss_result WHERE pid=? AND hide=0 ORDER BY sort";
        return __sqliteDB.selectAll(sql, [pid], null, dbName);
    },
};