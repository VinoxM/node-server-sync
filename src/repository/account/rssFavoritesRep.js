const dbName = 'account'

const enablePrint = { print: true }

export default {
    selectUserFavorites: (uid, subsIds) => {
        let sql = 'SELECT rss_subs_id as rssSubscribeId FROM user_rss_favorites WHERE uid = ?'
        let params = [uid]
        if (!isEmptyArray(subsIds)) {
            const arr = Array.from(subsIds)
            sql += 'AND rss_subs_id IN(' + new Array(arr.length).fill('?').join(',') + ')'
            params = [uid, ...arr]
        }
        return sqliteDB.selectAll(sql, params, null, dbName).then(({ data }) => data)
    },
    insertUserFavorite: (uid, subsId) => {
        const sql = 'INSERT INTO user_rss_favorites(uid, rss_subs_id) SELECT ?,? WHERE NOT EXISTS (' +
            'SELECT 1 FROM user_rss_favorites WHERE uid = ? AND rss_subs_id = ?)'
        return sqliteDB.insert(sql, [uid, subsId, uid, subsId], null, dbName).then(res => res.rows)
    },
    deleteUserFavorite: (uid, subsId) => {
        const sql = 'DELETE FROM user_rss_favorites WHERE uid = ? AND rss_subs_id = ?'
        return sqliteDB.delete(sql, [uid, subsId], enablePrint, dbName).then(res => res.rows)
    },
    selectUserFavoritesBySubsIds: (subsIds) => {
        if (isEmptyArray(subsIds)) {
            return Promise.resolve([])
        }
        let sql = 'SELECT rss_subs_id as rssSubscribeId FROM user_rss_favorites WHERE rss_subs_id IN ('
        const arr = Array.from(subsIds)
        sql += new Array(arr.length).fill('?').join(',') + ')'
        const params = arr
        return sqliteDB.selectAll(sql, params, null, dbName).then(({ data }) => data)
    }
}