const dbName = 'media'
const enablePrint = { print: true }

export default {
    /** Bilive Record */
    insertOneEvent: (event, sessionId, roomId, timestamp, eventId, eventData) => {
        const sql = `INSERT INTO bilive_record (event,session_id,room_id,event_timestamp,event_id,event_data, create_time) VALUES(?,?,?,?,?,?,?)`
        const params = [event, sessionId, roomId, timestamp, eventId, eventData, new Date()]
        return __sqliteDB.insert(sql, params, null, dbName)
    },
    selectEventsBySessionId: sessionId => {
        const sql = `SELECT id, event, session_id, room_id, event_timestamp, event_id, event_data FROM bilive_record WHERE session_id=?`
        return __sqliteDB.selectAll(sql, [sessionId], null, dbName)
    },
}