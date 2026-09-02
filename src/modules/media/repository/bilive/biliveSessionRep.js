const dbName = 'media';
const enablePrint = { print: true };

/**
 * B站直播录制会话 (Session) 数据访问仓库
 */
export default {
    /**
     * 插入录制会话记录（已存在同名 session_id 则跳过）
     * @param {string} sessionId - 会话唯一标识
     * @param {number} streamId - 关联的直播流 stream_id
     * @param {string|number} roomId - 直播间 ID
     * @param {any} startTime - 会话开始时间
     * @param {any} endTime - 会话结束时间
     * @returns {Promise<ExecResult>}
     */
    insertSession: (sessionId, streamId, roomId, startTime, endTime) => {
        const sql = `INSERT OR IGNORE INTO bilive_record_session(session_id, stream_id, room_id, start_time, end_time) VALUES(?,?,?,?,?)`;
        const params = [sessionId, streamId, roomId, startTime, endTime];
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 根据会话 ID 查询会话记录
     * @param {string} sessionId - 会话 ID
     * @returns {Promise<{ id: number, sessionId: string, streamId: number, roomId: string|number, startTime: string, endTime: string }|null>}
     */
    selectBySessionId: sessionId => {
        const sql = `SELECT id, session_id, stream_id, room_id, start_time, end_time FROM bilive_record_session WHERE session_id=?`;
        return __sqliteDB.selectOne(sql, [sessionId], null, dbName);
    },

    /**
     * 标记会话启动并回填开始时间
     * @param {string} sessionId - 会话 ID
     * @param {any} startTime - 开始时间
     * @returns {Promise<ExecResult>}
     */
    updateSessionStarted: (sessionId, startTime) => {
        const sql = `UPDATE bilive_record_session SET status=1,start_time=? WHERE session_id=? AND start_time IS NULL`;
        return __sqliteDB.update(sql, [startTime, sessionId], null, dbName);
    },

    /**
     * 标记会话结束并回填结束时间
     * @param {string} sessionId - 会话 ID
     * @param {any} endTime - 结束时间
     * @returns {Promise<ExecResult>}
     */
    updateSessionEnded: (sessionId, endTime) => {
        const sql = `UPDATE bilive_record_session SET status=1,end_time=? WHERE session_id=?`;
        return __sqliteDB.update(sql, [endTime, sessionId], null, dbName);
    }
};