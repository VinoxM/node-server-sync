const dbName = 'account'

const enablePrint = { print: true }

export default {
    selectUserFavorites: (uid, subsIds) => {
        let sql = 'SELECT rss_subs_id as rssSubscribeId FROM user_rss_favorites WHERE uid = ?'
        let params = [uid]
        if (!__isEmptyArray(subsIds)) {
            const arr = Array.from(subsIds)
            sql += 'AND rss_subs_id IN(' + new Array(arr.length).fill('?').join(',') + ')'
            params = [uid, ...arr]
        }
        return __sqliteDB.selectAll(sql, params, null, dbName)
    },
    insertUserFavorite: (uid, subsId) => {
        const sql = 'INSERT INTO user_rss_favorites(uid, rss_subs_id) SELECT ?,? WHERE NOT EXISTS (' +
            'SELECT 1 FROM user_rss_favorites WHERE uid = ? AND rss_subs_id = ?)'
        return __sqliteDB.insert(sql, [uid, subsId, uid, subsId], null, dbName)
    },
    deleteUserFavorite: (uid, subsId) => {
        const sql = 'DELETE FROM user_rss_favorites WHERE uid = ? AND rss_subs_id = ?'
        return __sqliteDB.delete(sql, [uid, subsId], enablePrint, dbName)
    },
    selectUserFavoritesBySubsIds: (subsIds) => {
        if (__isEmptyArray(subsIds)) {
            return Promise.resolve([])
        }
        let sql = 'SELECT rss_subs_id as rssSubscribeId FROM user_rss_favorites WHERE rss_subs_id IN ('
        const arr = Array.from(subsIds)
        sql += new Array(arr.length).fill('?').join(',') + ')'
        return __sqliteDB.selectAll(sql, arr, null, dbName)
    }
}