const dbName = 'account';

const enablePrint = { print: true };

/**
 * 用户 RSS 订阅收藏数据访问仓库
 */
export default {
    /**
     * 查询指定用户的 RSS 订阅收藏列表（可根据订阅 ID 列表进行范围筛选）
     * @param {number|string} uid - 用户 ID
     * @param {Array<number|string>} [subsIds] - 可选的 RSS 订阅 ID 列表过滤
     * @returns {Promise<QueryResult<{ rssSubscribeId: number }>>} 收藏记录列表结果对象
     */
    selectUserFavorites: (uid, subsIds) => {
        let sql = 'SELECT rss_subs_id as rssSubscribeId FROM user_rss_favorites WHERE uid = ?';
        let params = [uid];
        if (!__isEmptyArray(subsIds)) {
            const arr = Array.from(subsIds);
            sql += 'AND rss_subs_id IN(' + new Array(arr.length).fill('?').join(',') + ')';
            params = [uid, ...arr];
        }
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 插入一条用户 RSS 订阅收藏记录（已存在时跳过插入）
     * @param {number|string} uid - 用户 ID
     * @param {number|string} subsId - RSS 订阅 ID
     * @returns {Promise<ExecResult>} 插入结果对象
     */
    insertUserFavorite: (uid, subsId) => {
        const sql = 'INSERT INTO user_rss_favorites(uid, rss_subs_id) SELECT ?,? WHERE NOT EXISTS (' +
            'SELECT 1 FROM user_rss_favorites WHERE uid = ? AND rss_subs_id = ?)';
        return __sqliteDB.insert(sql, [uid, subsId, uid, subsId], null, dbName);
    },

    /**
     * 删除指定用户的某条 RSS 订阅收藏记录
     * @param {number|string} uid - 用户 ID
     * @param {number|string} subsId - RSS 订阅 ID
     * @returns {Promise<ExecResult>} 删除结果对象
     */
    deleteUserFavorite: (uid, subsId) => {
        const sql = 'DELETE FROM user_rss_favorites WHERE uid = ? AND rss_subs_id = ?';
        return __sqliteDB.delete(sql, [uid, subsId], enablePrint, dbName);
    },

    /**
     * 根据多个 RSS 订阅 ID 批量查询已被收藏的记录列表
     * @param {Array<number|string>} subsIds - RSS 订阅 ID 数组
     * @returns {Promise<QueryResult<{ rssSubscribeId: number }>>} 匹配的收藏记录结果对象
     */
    selectUserFavoritesBySubsIds: (subsIds) => {
        if (__isEmptyArray(subsIds)) {
            return Promise.resolve({ rows: 0, data: [] });
        }
        let sql = 'SELECT rss_subs_id as rssSubscribeId FROM user_rss_favorites WHERE rss_subs_id IN (';
        const arr = Array.from(subsIds);
        sql += new Array(arr.length).fill('?').join(',') + ')';
        return __sqliteDB.selectAll(sql, arr, null, dbName);
    }
};