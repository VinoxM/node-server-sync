import { MEDIA_BILIVE_STREAM_STATUS } from "../../constants/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

const STREAM_FULL_COLUMNS = [
    "id",
    "room_id",
    "host_name",
    "title",
    "area_name_parent",
    "area_name_child",
    "start_time",
    "end_time",
    "streaming",
    "end_reason",
    "end_by_record_id",
    "video_id"
]

export default {
    selectOneById: id => {
        const sql = `SELECT ${STREAM_FULL_COLUMNS.join(',')} `
            + `FROM bilive_record_stream WHERE id=?`
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    selectVideoExistsIdByStreamId: streamId => {
        const sql = `SELECT brs.video_id FROM bilive_record_stream brs INNER JOIN videos v ON v.id=brs.video_id WHERE brs.id = ?`
        return __sqliteDB.selectOne(sql, [streamId], null, dbName).then(data => data?.videoId)
    },
    insertStartStream: (roomId, hostName, title, areaNameParent, areaNameChild, startTime, endTime) => {
        const sql = `INSERT INTO bilive_record_stream (room_id, host_name, title, area_name_parent, area_name_child, start_time, end_time) VALUES(?,?,?,?,?,?,?)`
        const params = [roomId, hostName, title, areaNameParent, areaNameChild, startTime, endTime]
        return __sqliteDB.insert(sql, params, null, dbName)
    },
    selectLatestStreamByRoomId: (roomId) => {
        const sql = `SELECT id, start_time FROM bilive_record_stream WHERE room_id=? ORDER BY id DESC LIMIT 1`
        return __sqliteDB.selectOne(sql, [roomId], null, dbName)
    },
    selectLatestStreamingByRoomId: (roomId) => {
        const sql = `SELECT id, start_time, streaming FROM bilive_record_stream WHERE room_id=? AND streaming IN (${MEDIA_BILIVE_STREAM_STATUS.STREAMING}, ${MEDIA_BILIVE_STREAM_STATUS.READY_TO_ENDED}) ORDER BY id DESC LIMIT 1`
        return __sqliteDB.selectOne(sql, [roomId], null, dbName)
    },
    updateVideoIdById: (videoId, id) => {
        const sql = `UPDATE bilive_record_stream SET video_id=? WHERE id=?`
        return __sqliteDB.selectOne(sql, [videoId, id], null, dbName)
    },
    updateStreamReadyToEndedById: (id, endTime, recordId, reason) => {
        const sql = `UPDATE bilive_record_stream SET streaming=${MEDIA_BILIVE_STREAM_STATUS.READY_TO_ENDED},end_time=?,end_by_record_id=?,end_reason=? WHERE id=?`
        return __sqliteDB.update(sql, [endTime, recordId, reason, id], null, dbName)
    },
    updateStreamEndedById: (id, endTime, recordId, reason) => {
        const params = []
        let sql = `UPDATE bilive_record_stream SET streaming=${MEDIA_BILIVE_STREAM_STATUS.NOT_LIVE}`
        if (endTime) {
            sql += `,end_time=?`
            params.push(endTime)
        }
        if (recordId) {
            sql += `,end_by_record_id=?`
            params.push(recordId)
        }
        if (reason) {
            sql += `,end_reason=?`
            params.push(reason)
        }
        sql += ` WHERE id=?`
        params.push(id)
        return __sqliteDB.update(sql, params, null, dbName)
    },
    updateStreamEndedByRoomId: (roomId) => {
        const sql = `UPDATE bilive_record_stream SET streaming=${MEDIA_BILIVE_STREAM_STATUS.NOT_LIVE} WHERE room_id=?`
        return __sqliteDB.update(sql, [roomId], null, dbName)
    },
    selectEndedEventDataById: (id) => {
        const sql = `SELECT br.event,br.event_timestamp,br.event_data FROM bilive_record br WHERE br.id IN (SELECT brs.end_by_record_id FROM bilive_record_stream brs WHERE brs.id=?)`
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    deleteStreamById: id => {
        const sql = `DELETE FROM bilive_record_stream WHERE id=?`
        return __sqliteDB.delete(sql, [id], null, dbName)
    },
    selectStreamForSearch: (roomId, hostName, pageSize, pageNum) => {
        const params = []
        let sql = `SELECT ${STREAM_FULL_COLUMNS.slice(0, STREAM_FULL_COLUMNS.length - 1).map(c => 'brs.' + c).join(',')}, v.id AS videoExists `
            + `FROM bilive_record_stream brs `
            + `LEFT JOIN videos v ON v.id=brs.video_id `
        const concat = []
        if (__isNotBlank(roomId)) {
            concat.push(`brs.room_id=? `)
            params.push(roomId)
        }
        if (__isNotBlank(hostName)) {
            concat.push(`brs.host_name like ? `)
            params.push(`%${hostName}%`)
        }
        if (concat.length > 0) {
            sql += `WHERE ` + concat.join('AND ')
        }
        sql += `ORDER BY brs.id DESC `
        if (pageNum !== undefined && pageSize !== undefined) {
            const offset = (pageNum - 1) * pageSize;
            sql += ' LIMIT ? OFFSET ?';
            params.push(pageSize, offset);
        }
        return __sqliteDB.selectAll(sql, params, null, dbName)
    },
    selectStreamForSearchCount: (roomId, hostName) => {
        const params = []
        let sql = `SELECT COUNT(id) as total FROM bilive_record_stream `
        const concat = []
        if (__isNotBlank(roomId)) {
            concat.push(`room_id=? `)
            params.push(roomId)
        }
        if (__isNotBlank(hostName)) {
            concat.push(`host_name like ? `)
            params.push(`%${hostName}%`)
        }
        if (concat.length > 0) {
            sql += `WHERE ` + concat.join('AND ')
        }
        return __sqliteDB.selectOne(sql, params, null, dbName).then(({ total }) => total || 0);
    }
}