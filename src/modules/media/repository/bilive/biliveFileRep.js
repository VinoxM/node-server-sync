import { MEDIA_BILIVE_RECORD_FILE_STATUS, MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS } from "../../constants/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

const FULL_QUERY_PARAMETERS = `id, session_id, stream_id, title, file_path, file_size, start_time, end_time, file_status, sync_status`

export default {
    insertFile: (sessionId, streamId, title, filePath, startTime, endTime, fileSize = 0) => {
        const sql = `INSERT INTO bilive_record_files(session_id, stream_id, title, file_path, file_size, start_time, end_time, file_status) VALUES(?,?,?,?,?,?,?,?)`
        const params = [sessionId, streamId, title, filePath, fileSize, startTime, endTime, MEDIA_BILIVE_RECORD_FILE_STATUS.OPENING]
        return __sqliteDB.insert(sql, params, null, dbName)
    },
    selectByFilePath: filePath => {
        const sql = `SELECT ${FULL_QUERY_PARAMETERS} FROM bilive_record_files WHERE file_path=?`
        return __sqliteDB.selectOne(sql, [filePath], null, dbName)
    },
    updateFileClosed: (endTime, fileSize, id) => {
        const sql = `UPDATE bilive_record_files SET end_time=?,file_size=?,status=? WHERE id=?`
        const params = [endTime, fileSize, MEDIA_BILIVE_RECORD_FILE_STATUS.CLOSED, id]
        return __sqliteDB.update(sql, params, null, dbName)
    },
    selectFileById: id => {
        const sql = `SELECT ${FULL_QUERY_PARAMETERS} FROM bilive_record_files WHERE id=?`
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    updateFileUploading: id => {
        const sql = `UPDATE bilive_record_files SET sync_status=? WHERE id=?`
        const params = [MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.SYNCHRONIZING, id]
        return __sqliteDB.update(sql, params, null, dbName)
    },
    updateFileUploaded: id => {
        const sql = `UPDATE bilive_record_files SET sync_status=? WHERE id=? AND sync_status=?`
        const params = [MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.SYNCHRONIZED, id, MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.SYNCHRONIZING]
        return __sqliteDB.update(sql, params, null, dbName)
    },
    setupFileRemoved: id => {
        const sql = `UPDATE bilive_record_files SET file_status=? WHERE id=?`
        const params = [MEDIA_BILIVE_RECORD_FILE_STATUS.REMOVED, id]
        return __sqliteDB.update(sql, params, null, dbName)
    },
    selectFilesByStreamId: streamId => {
        const sql = `SELECT ${FULL_QUERY_PARAMETERS} FROM bilive_record_files WHERE stream_id=?`
        return __sqliteDB.selectAll(sql, [streamId], null, dbName)
    }
}