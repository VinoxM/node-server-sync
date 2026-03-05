const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertOne: video => {
        const sql = 'INSERT INTO videos(unique_id, title, author_id, category_id, upload_time, create_time) VALUES(?,?,?,?,?,?)'
        const params = [video.uniqueId, video.title, video.authorId, video.categoryId, video.uploadTime, new Date()]
        return sqliteDB.insert(sql, params, null, dbName)
    },
    deleteOne: videoId => {
        const sql = 'DELETE FROM videos WHERE id=?'
        return sqliteDB.delete(sql, [videoId], null, dbName)
    }
}