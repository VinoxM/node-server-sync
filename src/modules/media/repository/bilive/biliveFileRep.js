import { MEDIA_BILIVE_RECORD_FILE_STATUS, MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS } from "../../constants/mediaConst.js";

const dbName = 'media';
const enablePrint = { print: true };

const FULL_QUERY_PARAMETERS = `id, session_id, stream_id, title, file_path, file_size, start_time, end_time, file_status, sync_status`;

/**
 * B站直播录制切片文件数据访问仓库
 */
export default {
    /**
     * 插入一条录制文件记录（如果文件路径已存在则跳过）
     * @param {string} sessionId - 录制会话 ID
     * @param {number} streamId - 录制流 ID
     * @param {string} title - 切片标题
     * @param {string} filePath - 本地录制文件绝对路径
     * @param {any} startTime - 开始录制时间
     * @param {any} endTime - 结束录制时间
     * @param {number} [fileSize=0] - 初始文件大小
     * @returns {Promise<ExecResult>}
     */
    insertFile: (sessionId, streamId, title, filePath, startTime, endTime, fileSize = 0) => {
        const sql = `INSERT INTO bilive_record_files(session_id, stream_id, title, file_path, file_size, start_time, end_time, file_status) `
            + `SELECT ?,?,?,?,?,?,?,? `
            + `WHERE NOT EXISTS (SELECT 1 FROM bilive_record_files WHERE file_path=?)`;
        const params = [sessionId, streamId, title, filePath, fileSize, startTime, endTime, MEDIA_BILIVE_RECORD_FILE_STATUS.OPENING, filePath];
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 根据本地文件路径查询录制文件记录
     * @param {string} filePath - 文件路径
     * @returns {Promise<{ id: number, sessionId: string, streamId: number, title: string, filePath: string, fileSize: number, startTime: string, endTime: string, fileStatus: number, syncStatus: number }|null>}
     */
    selectByFilePath: filePath => {
        const sql = `SELECT ${FULL_QUERY_PARAMETERS} FROM bilive_record_files WHERE file_path=?`;
        return __sqliteDB.selectOne(sql, [filePath], null, dbName);
    },

    /**
     * 更新录制文件开始时间
     * @param {any} startTime - 开始时间
     * @param {number} id - 文件主键 ID
     * @returns {Promise<ExecResult>}
     */
    updateFileOpenTime: (startTime, id) => {
        const sql = `UPDATE bilive_record_files SET start_time=? WHERE id=?`;
        const params = [startTime, id];
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 更新切片文件为已关闭状态 (CLOSED)，记录结束时间与文件大小
     * @param {any} endTime - 结束录制时间
     * @param {number} fileSize - 最终文件大小 (字节)
     * @param {number} id - 文件 ID
     * @returns {Promise<ExecResult>}
     */
    updateFileClosed: (endTime, fileSize, id) => {
        const sql = `UPDATE bilive_record_files SET end_time=?,file_size=?,file_status=? WHERE id=?`;
        const params = [endTime, fileSize, MEDIA_BILIVE_RECORD_FILE_STATUS.CLOSED, id];
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 根据主键 ID 查询录制文件记录
     * @param {number} id - 文件 ID
     * @returns {Promise<{ id: number, sessionId: string, streamId: number, title: string, filePath: string, fileSize: number, startTime: string, endTime: string, fileStatus: number, syncStatus: number }|null>}
     */
    selectFileById: id => {
        const sql = `SELECT ${FULL_QUERY_PARAMETERS} FROM bilive_record_files WHERE id=?`;
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 查询指定直播流关联的第一个录制切片文件
     * @param {number} streamId - 直播流 ID
     * @returns {Promise<{ id: number, sessionId: string, streamId: number, title: string, filePath: string, fileSize: number, startTime: string, endTime: string, fileStatus: number, syncStatus: number }|null>}
     */
    selectFirstFileByStreamId: streamId => {
        const sql = `SELECT ${FULL_QUERY_PARAMETERS} FROM bilive_record_files WHERE stream_id=? ORDER BY id LIMIT 1`;
        return __sqliteDB.selectOne(sql, [streamId], null, dbName);
    },

    /**
     * 将文件同步状态更新为同步中 (SYNCHRONIZING)
     * @param {number} id - 文件 ID
     * @returns {Promise<ExecResult>}
     */
    updateFileUploading: id => {
        const sql = `UPDATE bilive_record_files SET sync_status=? WHERE id=? AND sync_status!=? AND file_status=?`;
        const params = [MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.SYNCHRONIZING, id, MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.SYNCHRONIZING, MEDIA_BILIVE_RECORD_FILE_STATUS.CLOSED];
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 将文件同步状态更新为已同步 (SYNCHRONIZED)
     * @param {number} id - 文件 ID
     * @returns {Promise<ExecResult>}
     */
    updateFileUploaded: id => {
        const sql = `UPDATE bilive_record_files SET sync_status=? WHERE id=? AND sync_status=?`;
        const params = [MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.SYNCHRONIZED, id, MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.SYNCHRONIZING];
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 将文件状态临时减 10，标记为待删除状态
     * @param {number} id - 文件 ID
     * @returns {Promise<ExecResult>}
     */
    updateFileRemovedPending: id => {
        const sql = `UPDATE bilive_record_files SET file_status=file_status-10 WHERE id=?`;
        const params = [id];
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 将文件状态正式更新为已删除 (REMOVED)
     * @param {number} id - 文件 ID
     * @returns {Promise<ExecResult>}
     */
    updateFileRemoved: id => {
        const sql = `UPDATE bilive_record_files SET file_status=? WHERE id=? and file_status<?`;
        const params = [MEDIA_BILIVE_RECORD_FILE_STATUS.REMOVED, id, MEDIA_BILIVE_RECORD_FILE_STATUS.REMOVED];
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 恢复删除失败的文件状态 (状态值 +10 回滚)
     * @param {number} id - 文件 ID
     * @returns {Promise<ExecResult>}
     */
    restoreFileRemoveFailed: id => {
        const sql = `UPDATE bilive_record_files SET file_status=file_status+10 WHERE id=? and file_status<?`;
        const params = [id, MEDIA_BILIVE_RECORD_FILE_STATUS.REMOVED];
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 物理删除已标记为 REMOVED 的文件记录
     * @param {number} id - 文件 ID
     * @returns {Promise<ExecResult>}
     */
    deleteFileById: id => {
        const sql = `DELETE FROM bilive_record_files WHERE id=? AND file_status=?`;
        return __sqliteDB.delete(sql, [id, MEDIA_BILIVE_RECORD_FILE_STATUS.REMOVED], null, dbName);
    },

    /**
     * 查询指定直播流下的全部切片文件列表
     * @param {number} streamId - 直播流 ID
     * @returns {Promise<QueryResult<{ id: number, sessionId: string, streamId: number, title: string, filePath: string, fileSize: number, startTime: string, endTime: string, fileStatus: number, syncStatus: number }>>}
     */
    selectFilesByStreamId: streamId => {
        const sql = `SELECT ${FULL_QUERY_PARAMETERS} FROM bilive_record_files WHERE stream_id=?`;
        return __sqliteDB.selectAll(sql, [streamId], null, dbName);
    }
};