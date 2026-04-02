import { MEDIA_MINIO_STATUS, MEDIA_MINIO_TYPE_MAIN, MEDIA_VIDEO_MINIO_TYPE } from "../constants/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectMinioExistsByVideoId: videoId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM video_minio WHERE video_id = ? LIMIT 1) AS [exists]`
        return __sqliteDB.selectOne(sql, [videoId], null, dbName).then(({ exists }) => exists)
    },
    selectMinioExistsByVideoIdAndType: (videoId, type) => {
        const sql = `SELECT EXISTS(SELECT 1 FROM video_minio WHERE video_id = ? AND type = ? LIMIT 1) AS [exists]`
        return __sqliteDB.selectOne(sql, [videoId, type], null, dbName).then(({ exists }) => exists)
    },
    selectOneById: id => {
        const sql = 'SELECT id,video_id,type,origin_uri,link,status FROM video_minio WHERE id=?'
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    insertOne: minio => {
        const sql = 'INSERT OR IGNORE INTO video_minio(video_id, type, origin_uri, link, title, status, sort) VALUES(?,?,?,?,?,?,?)'
        return __sqliteDB.insert(sql, [minio.videoId, minio.type, minio.uri, minio.link, minio.title, minio.status, minio.sort ?? 0], null, dbName)
    },
    updateStatusById: (id, status) => {
        const sql = 'UPDATE video_minio SET status=? WHERE id=?'
        return __sqliteDB.update(sql, [status, id], null, dbName)
    },
    updateStatusByIdAndCurrentStatus: (id, status, currentStatus) => {
        const sql = 'UPDATE video_minio SET status=? WHERE id=? AND status=?'
        return __sqliteDB.update(sql, [status, id, currentStatus], null, dbName)
    },
    setupFailedByIdWhenNotComplete: (id) => {
        const sql = 'UPDATE video_minio SET status=? WHERE id=? AND status!=?'
        return __sqliteDB.update(sql, [MEDIA_MINIO_STATUS.FAILED, id, MEDIA_MINIO_STATUS.COMPLETE], null, dbName)
    },
    updateOriginUriById: (originUri, id) => {
        const sql = 'UPDATE video_minio SET origin_uri=? WHERE id=?'
        return __sqliteDB.update(sql, [originUri, id], null, dbName)
    },
    updateTitleAndSortById: (title, sort, id) => {
        const sql = 'UPDATE video_minio SET title=?, sort=? WHERE id=?'
        return __sqliteDB.update(sql, [title, sort, id], null, dbName)
    },
    deleteByMinioId: minioId => {
        const sql = `DELETE FROM video_minio WHERE id = ? AND status=${MEDIA_MINIO_STATUS.REMOVED}`
        return __sqliteDB.delete(sql, [minioId], null, dbName)
    },
    selectMinioCompleteByVideoId: videoId => {
        const sql = `SELECT COUNT(*) as total, (COUNT(*) > 0 AND SUM(status NOT IN (${MEDIA_MINIO_STATUS.COMPLETE}, ${MEDIA_MINIO_STATUS.FAILED})) = 0) AS complete `
            + `FROM video_minio `
            + `WHERE video_id = ? AND type IN (${MEDIA_MINIO_TYPE_MAIN.join(",")})`
        return __sqliteDB.selectOne(sql, [videoId], null, dbName)
    },
    selectByVideoId: videoId => {
        const sql = `SELECT id, video_id, type, origin_uri, link, title, status, sort FROM video_minio WHERE video_id=?`
        return __sqliteDB.selectAll(sql, [videoId], null, dbName)
    },
    selectSourceByVideoId: videoId => {
        const sql = `SELECT id, link, title, sort FROM video_minio WHERE video_id=? AND type=${MEDIA_VIDEO_MINIO_TYPE.SOURCE} AND status=${MEDIA_MINIO_STATUS.COMPLETE} ORDER BY sort`
        return __sqliteDB.selectAll(sql, [videoId], null, dbName)
    },
    selectBarrageByVideoId: videoId => {
        const sql = `SELECT id, link, title, sort FROM video_minio WHERE video_id=? AND type=${MEDIA_VIDEO_MINIO_TYPE.BARRAGE} AND status=${MEDIA_MINIO_STATUS.COMPLETE} ORDER BY sort`
        return __sqliteDB.selectAll(sql, [videoId], null, dbName)
    }
}