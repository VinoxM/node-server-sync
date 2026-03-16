import { MEDIA_MINIO_STATUS } from "../../constraints/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectByVideoId: videoId => {
        const sql = 'SELECT id,video_id,type,origin_uri,file_path,link,status FROM video_minio WHERE video_id=?'
        return sqliteDB.selectAll(sql, [videoId], null, dbName)
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
    updateStatusByIds: (ids, status) => {
        if (isEmptyArray(ids)) return Promise.resolve()
        let sql = 'UPDATE video_minio SET status=? WHERE id IN ('
        sql += ids.map(() => "?").join(',') + ')'
        return sqliteDB.update(sql, [status, ...ids], null, dbName)
    },
    updateFilePathById: (id, filePath) => {
        const sql = 'UPDATE video_minio SET file_path=? WHERE id=?'
        return sqliteDB.update(sql, [filePath, id], null, dbName)
    },
    deleteByVideoId: videoId => {
        const sql = 'DELETE FROM video_minio WHERE video_id=?'
        return sqliteDB.delete(sql, [videoId], null, dbName)
    },
    selectMinioCompleteByVideoId: videoId => {
        const sql = `SELECT COUNT(*) as total, (COUNT(*) > 0 AND SUM(status NOT IN (${MEDIA_MINIO_STATUS.COMPLETE}, ${MEDIA_MINIO_STATUS.FAILED})) = 0) AS complete `
            + `FROM video_minio `
            + `WHERE video_id = ?`
        return sqliteDB.selectOne(sql, [videoId], null, dbName)
    },
    selectByVideoIdForDisplay: videoId => {
        const sql = 'SELECT tm.id, tt.id taskId, tm.video_id, tm.type, tm.origin_uri, tm.file_path, tm.link, tm.status, tt.gid, tt.status taskStatus, tt.file_path savePath, tt.file_num '
            + 'FROM video_minio tm '
            + 'LEFT JOIN aria2_task tt ON tt.minio_id=tm.id '
            + 'WHERE tm.video_id=? '
        return sqliteDB.selectAll(sql, [videoId], null, dbName)
    }
}