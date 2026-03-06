const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertOne: video => {
        const sql = 'INSERT INTO videos(unique_id, title, author_id, category_id, upload_time, status, create_time) VALUES(?,?,?,?,?,?,?)'
        const params = [video.uniqueId, video.title, video.authorId, video.categoryId, video.uploadTime, video.status, new Date()]
        return sqliteDB.insert(sql, params, null, dbName)
    },
    updateVideoStatus: (videoId, status) => {
        const sql = 'UPDATE videos SET status=? WHERE id=?'
        const params = [status, videoId]
        return sqliteDB.update(sql, params, null, dbName)
    },
    selectOne: videoId => {
        const sql = 'SELECT id, unique_id, title, author_id, category_id, upload_time, status, create_time FROM videos WHERE id=?'
        return sqliteDB.selectOne(sql, [videoId], null, dbName)
    },
    deleteOne: videoId => {
        const sql = 'DELETE FROM videos WHERE id=?'
        return sqliteDB.delete(sql, [videoId], null, dbName)
    }
}