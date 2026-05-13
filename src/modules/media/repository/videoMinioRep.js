import { MEDIA_MINIO_STATUS, MEDIA_VIDEO_MINIO_TYPE } from "../constants/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectUploadingMinioExistsByVideoId: videoId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM video_minio WHERE video_id = ? AND status = ${MEDIA_MINIO_STATUS.UPLOADING} LIMIT 1) AS [exists]`
        return __sqliteDB.selectOne(sql, [videoId], null, dbName).then(({ exists }) => exists)
    },
    selectMinioExistsByVideoIdAndType: (videoId, type) => {
        const sql = `SELECT EXISTS(SELECT 1 FROM video_minio WHERE video_id = ? AND type = ? LIMIT 1) AS [exists]`
        return __sqliteDB.selectOne(sql, [videoId, type], null, dbName).then(({ exists }) => exists)
    },
    selectOneById: id => {
        const sql = 'SELECT id,video_id,type,origin_uri,link,status,object_size FROM video_minio WHERE id=?'
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    selectMaxSortOfType: (videoId, type) => {
        const sql = 'SELECT MAX(sort) AS sort FROM video_minio WHERE video_id=? AND type=?'
        return __sqliteDB.selectOne(sql, [videoId, type], null, dbName).then(data => (data?.sort ?? 0))
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
        const CAN_NOT_SETUP_FAILED_MINIO_STATUS = [MEDIA_MINIO_STATUS.COMPLETE, MEDIA_MINIO_STATUS.REMOVED]
        let sql = 'UPDATE video_minio SET status=? WHERE id=?'
        if (CAN_NOT_SETUP_FAILED_MINIO_STATUS.length > 0) {
            sql += ` AND status NOT IN (${CAN_NOT_SETUP_FAILED_MINIO_STATUS.join(',')})`
        }
        return __sqliteDB.update(sql, [MEDIA_MINIO_STATUS.FAILED, id], null, dbName)
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
    selectByVideoId: videoId => {
        const sql = `SELECT id, video_id, type, origin_uri, link, title, status, sort, object_size FROM video_minio WHERE video_id=?`
        return __sqliteDB.selectAll(sql, [videoId], null, dbName)
    },
    selectByMinioIds: async minioIds => {
        if (__isEmptyArray(minioIds)) {
            return { rows: 0, data: [] }
        }
        const sql = `SELECT id, video_id, type, origin_uri, link, title, status, sort FROM video_minio WHERE id IN (${minioIds.map(() => '?').join(',')})`
        return __sqliteDB.selectAll(sql, minioIds, null, dbName)
    },
    selectSourceByVideoId: videoId => {
        const sql = `SELECT id, link, title, sort FROM video_minio WHERE video_id=? AND type=${MEDIA_VIDEO_MINIO_TYPE.SOURCE} AND status=${MEDIA_MINIO_STATUS.COMPLETE} ORDER BY sort`
        return __sqliteDB.selectAll(sql, [videoId], null, dbName)
    },
    selectBarrageByVideoId: videoId => {
        const sql = `SELECT id, link, title, sort FROM video_minio WHERE video_id=? AND type=${MEDIA_VIDEO_MINIO_TYPE.BARRAGE} AND status=${MEDIA_MINIO_STATUS.COMPLETE} ORDER BY sort`
        return __sqliteDB.selectAll(sql, [videoId], null, dbName)
    },
    /** Object Size */
    updateObjectSizeById: (objectSize, id) => {
        const sql = `UPDATE video_minio SET object_size=? WHERE id=?`
        return __sqliteDB.update(sql, [objectSize, id], null, dbName)
    }
}