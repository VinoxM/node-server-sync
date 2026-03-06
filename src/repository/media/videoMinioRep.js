const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectByVideoId: (videoId) => {
        const sql = 'SELECT video_id,type,link,status FROM video_minio WHERE video_id=?'
        return sqliteDB.selectAll(sql, [videoId], null, dbName)
    },
    insertOne: minio => {
        const sql = 'INSERT INTO video_minio(video_id, type, link, status) VALUES(?,?,?,?)'
        return sqliteDB.insert(sql, [minio.videoId, minio.type, minio.link, minio.status], null, dbName)
    },
    updateStatus: (videoId, type, status) => {
        const sql = 'UPDATE video_minio SET status=? WHERE video_id=? AND type=?'
        return sqliteDB.update(sql, [status, videoId, type], null, dbName)
    },
    deleteByVideoId: videoId => {
        const sql = 'DELETE FROM video_minio WHERE video_id=?'
        return sqliteDB.delete(sql, [videoId], null, dbName)
    },
    insertOneFailed: minioFailed => {
        const sql = 'INSERT INTO video_minio_failed(video_id,type,link,uri,reason,create_time) ' +
            'VALUES(?,?,?,?,?,?)'
        const params = [
            minioFailed.videoId,
            minioFailed.type,
            minioFailed.link,
            minioFailed.uri,
            minioFailed.reason,
            new Date()
        ]
        return sqliteDB.insert(sql, params, null, dbName)
    },
    deleteFailedByVideoId: videoId => {
        const sql = 'DELETE FROM video_minio_failed WHERE video_id=?'
        return sqliteDB.delete(sql, [videoId], null, dbName)
    }
}