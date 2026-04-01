const dbName = 'media'
const enablePrint = { print: true }

export default {
    /** Bilive Record */
    insertOneEvent: (event, sessionId, roomId, shortId, timestamp, eventId, eventData) => {
        const sql = `INSERT INTO bilive_record (event,session_id,room_id,short_id,event_timestamp,event_id,event_data, create_time) VALUES(?,?,?,?,?,?,?,?)`
        const params = [event, sessionId, roomId, shortId, timestamp, eventId, eventData, new Date()]
        return __sqliteDB.insert(sql, params, null, dbName)
    },
    selectEventsBySessionId: sessionId => {
        const sql = `SELECT id, event, session_id, room_id, short_id, event_timestamp, event_id, event_data FROM bilive_record WHERE session_id=?`
        return __sqliteDB.selectAll(sql, [sessionId], null, dbName)
    },
    /** Bilive Record Session */
    selectSessionExists: sessionId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM bilive_record_session WHERE session_id = ? LIMIT 1) AS [exists]`
        return __sqliteDB.selectOne(sql, [sessionId], null, dbName).then(({ exists }) => exists)
    },
    insertSession: (sessionId, eventTimestamp, roomId, hostName) => {
        const sql = `INSERT OR IGNORE INTO bilive_record_session(session_id, start_time, room_id, host_name) VALUES(?,?,?,?)`
        return __sqliteDB.insert(sql, [sessionId, eventTimestamp ?? new Date(), roomId, hostName], null, dbName)
    },
    updateSessionEndTime: (sessionId, endTime) => {
        const sql = `UPDATE bilive_record_session SET end_time=? WHERE session_id=?`
        return __sqliteDB.update(sql, [endTime ?? new Date(), sessionId], null, dbName)
    },
    selectSessions: (currentPage, pageSize) => {
        let sql = `SELECT session_id, room_id, host_name, start_time, end_time FROM bilive_record_session ORDER BY start_time DESC`
        const params = []
        if (!__isAnyBlank(currentPage, pageSize)) {
            sql += ` LIMIT ? OFFSET ?`
            const offset = (currentPage - 1) * pageSize;
            params.push(pageSize, offset)
        }
        return __sqliteDB.selectAll(sql, params, null, dbName)
    },
    selectSessionsTotal: () => {
        const sql = `SELECT COUNT(1) AS total FROM bilive_record_session`
        return __sqliteDB.selectOne(sql, [], null, dbName).then(data => data.total)
    },
}