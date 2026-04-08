const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertSession: (sessionId, streamId, roomId, startTime, endTime) => {
        const sql = `INSERT OR IGNORE INTO bilive_record_session(session_id, stream_id, room_id, start_time, end_time) VALUES(?,?,?,?,?)`
        const params = [sessionId, streamId, roomId, startTime, endTime]
        return __sqliteDB.insert(sql, params, null, dbName)
    },
    selectBySessionId: sessionId => {
        const sql = `SELECT id, session_id, stream_id, room_id, start_time, end_time FROM bilive_record_session WHERE session_id=?`
        return __sqliteDB.selectOne(sql, [sessionId], null, dbName)
    },
    updateSessionStarted: (sessionId, startTime) => {
        const sql = `UPDATE bilive_record_session SET status=1,start_time=? WHERE session_id=? AND start_time IS NULL`
        return __sqliteDB.update(sql, [startTime, sessionId], null, dbName)
    },
    updateSessionEnded: (sessionId, endTime) => {
        const sql = `UPDATE bilive_record_session SET status=1,end_time=? WHERE session_id=?`
        return __sqliteDB.update(sql, [endTime, sessionId], null, dbName)
    }
}