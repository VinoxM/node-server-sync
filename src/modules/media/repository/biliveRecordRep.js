const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertOne: (event, sessionId, roomId, shortId, timestamp, eventId, eventData) => {
        const sql = `INSERT INTO bilive_record (event,session_id,room_id,short_id,event_timestamp,event_id,event_data) VALUES(?,?,?,?,?,?,?)`
        const params = [event, sessionId, roomId, shortId, timestamp, eventId, eventData]
        return __sqliteDB.insert(sql, params, null, dbName)
    }
}