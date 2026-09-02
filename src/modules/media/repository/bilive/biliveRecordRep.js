const dbName = 'media';
const enablePrint = { print: true };

/**
 * B站直播原始 Webhook 事件日志数据访问仓库
 */
export default {
    /**
     * 记录一条收到的原始直播 Webhook 事件
     * @param {string} event - 事件名称 (如 SessionStarted, FileOpening 等)
     * @param {string} sessionId - 会话 ID
     * @param {string|number} roomId - 直播间 ID
     * @param {string|number} timestamp - 事件时间戳
     * @param {string} eventId - 事件唯一标识
     * @param {string} eventData - 事件原始 JSON 载荷
     * @returns {Promise<ExecResult>}
     */
    insertOneEvent: (event, sessionId, roomId, timestamp, eventId, eventData) => {
        const sql = `INSERT INTO bilive_record (event,session_id,room_id,event_timestamp,event_id,event_data, create_time) VALUES(?,?,?,?,?,?,?)`;
        const params = [event, sessionId, roomId, timestamp, eventId, eventData, new Date()];
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 根据会话 ID 查询该会话下的所有历史原始事件
     * @param {string} sessionId - 会话 ID
     * @returns {Promise<QueryResult<{ id: number, event: string, sessionId: string, roomId: string|number, eventTimestamp: string, eventId: string, eventData: string }>>}
     */
    selectEventsBySessionId: sessionId => {
        const sql = `SELECT id, event, session_id, room_id, event_timestamp, event_id, event_data FROM bilive_record WHERE session_id=?`;
        return __sqliteDB.selectAll(sql, [sessionId], null, dbName);
    }
};