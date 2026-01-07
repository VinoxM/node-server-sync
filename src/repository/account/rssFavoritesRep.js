const dbName = 'account'

const enablePrint = { print: true }

export default {
    selectUserFavorites: (uid) => {
        const sql = 'SELECT rss_subs_id as rssSubscribeId FROM user_rss_favorites WHERE uid = ?'
        return sqliteDB.selectAll(sql, [uid], null, dbName).then(({ data }) => data)
    },
    insertUserFavorite: (uid, subsId) => {
        const sql = 'INSERT OR IGNORE INTO user_rss_favorites(uid, rss_subs_id) values(?, ?)'
        return sqliteDB.insert(sql, [uid, subsId], null, dbName).then(res => res.rows)
    },
    deleteUserFavorite: (uid, subsId) => {
        const sql = 'DELETE FROM user_rss_favorites WHERE uid = ? AND rss_subs_id = ?'
        return sqliteDB.delete(sql, [uid, subsId], enablePrint, dbName).then(res => res.rows)
    },
}