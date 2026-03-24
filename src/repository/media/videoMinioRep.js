import { MEDIA_MINIO_STATUS } from "../../constraints/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectMinioExistsByVideoId: videoId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM video_minio WHERE video_id = ? LIMIT 1) AS [exists]`
        return sqliteDB.selectOne(sql, [videoId], null, dbName).then(({ exists }) => exists)
    },
    selectOneByVideoIdAndType: (videoId, type) => {
        const sql = 'SELECT id,video_id,type,origin_uri,file_path,link,status FROM video_minio WHERE video_id=? AND type=?'
        return sqliteDB.selectOne(sql, [videoId, type], null, dbName)
    },
    selectOneById: id => {
        const sql = 'SELECT id,video_id,type,origin_uri,file_path,link,status FROM video_minio WHERE id=?'
        return sqliteDB.selectOne(sql, [id], null, dbName)
    },
    insertOne: minio => {
        const sql = 'INSERT OR IGNORE INTO video_minio(video_id, type, origin_uri, file_path, link, status) VALUES(?,?,?,?,?,?)'
        return sqliteDB.insert(sql, [minio.videoId, minio.type, minio.uri, minio.filePath, minio.link, minio.status], null, dbName)
    },
    updateStatusById: (id, status) => {
        const sql = 'UPDATE video_minio SET status=? WHERE id=?'
        return sqliteDB.update(sql, [status, id], null, dbName)
    },
    updateStatusByIdAndCurrentStatus: (id, status, currentStatus) => {
        const sql = 'UPDATE video_minio SET status=? WHERE id=? AND status=?'
        return sqliteDB.update(sql, [status, id, currentStatus], null, dbName)
    },
    setupFailedByIdWhenNotComplete: (id) => {
        const sql = 'UPDATE video_minio SET status=? WHERE id=? AND status!=?'
        return sqliteDB.update(sql, [MEDIA_MINIO_STATUS.FAILED, id, MEDIA_MINIO_STATUS.COMPLETE], null, dbName)
    },
    updateOriginUriById: (originUri, id) => {
        const sql = 'UPDATE video_minio SET origin_uri=? WHERE id=?'
        return sqliteDB.update(sql, [originUri, id], null, dbName)
    },
    deleteByMinioId: minioId => {
        const sql = `DELETE FROM video_minio WHERE id = ? AND status=${MEDIA_MINIO_STATUS.REMOVED}`
        return sqliteDB.delete(sql, [minioId], null, dbName)
    },
    selectMinioCompleteByVideoId: videoId => {
        const sql = `SELECT COUNT(*) as total, (COUNT(*) > 0 AND SUM(status NOT IN (${MEDIA_MINIO_STATUS.COMPLETE}, ${MEDIA_MINIO_STATUS.FAILED})) = 0) AS complete `
            + `FROM video_minio `
            + `WHERE video_id = ?`
        return sqliteDB.selectOne(sql, [videoId], null, dbName)
    },
    selectByVideoId: videoId => {
        const sql = `SELECT id, video_id, type, origin_uri, link, status FROM video_minio WHERE video_id=?`
        return sqliteDB.selectAll(sql, [videoId], null, dbName)
    }
}