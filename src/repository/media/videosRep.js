import { MEDIA_TYPE_DESCRIPTION } from "../../constraints/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertOne: video => {
        const sql = 'INSERT INTO videos(unique_id, title, category_id, author_id, upload_time, status, create_time) VALUES(?,?,?,?,?,?,?)'
        const params = [video.uniqueId, video.title, video.categoryId, video.authorId, video.uploadTime, video.status, new Date()]
        return sqliteDB.insert(sql, params, null, dbName)
    },
    updateMinioIdById: (videoId, minioId, type) => {
        const columnName = MEDIA_TYPE_DESCRIPTION[type] + '_id'
        const sql = `UPDATE videos SET ${columnName}=? WHERE id=?`
        return sqliteDB.update(sql, [minioId, videoId], null, dbName)
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