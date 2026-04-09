const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectOneById: id => {
        const sql = `SELECT id, room_id, host_name, title, area_name_parent, area_name_child, start_time, end_time, streaming, end_reason, end_by_record_id, video_id `
            + `FROM bilive_record_stream WHERE id=?`
        return __sqliteDB.selectOne(sql, [id], null, dbName)
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
        const sql = `SELECT id, start_time FROM bilive_record_stream WHERE room_id=? AND streaming=1 ORDER BY id DESC LIMIT 1`
        return __sqliteDB.selectOne(sql, [roomId], null, dbName)
    },
    updateStreamEndedById: (id, endTime, recordId, reason) => {
        const sql = `UPDATE bilive_record_stream SET streaming=0,end_time=?,end_by_record_id=?,end_reason=? WHERE id=?`
        return __sqliteDB.update(sql, [endTime, recordId, reason, id], null, dbName)
    },
    updateStreamEndedByRoomId: (roomId) => {
        const sql = `UPDATE bilive_record_stream SET streaming=0 WHERE room_id=?`
        return __sqliteDB.update(sql, [roomId], null, dbName)
    },
    selectEndedEventDataById: (id) => {
        const sql = `SELECT br.event,br.event_timestamp,br.event_data FROM bilive_record br WHERE br.id IN (SELECT brs.record_id FROM bilive_record_stream brs WHERE brs.id=?)`
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    selectStreamForSearch: (roomId, hostName, pageSize, pageNum) => {
        const params = []
        let sql = `SELECT id,room_id,host_name,title,area_name_parent,area_name_child,start_time,end_time,streaming,end_reason,end_by_record_id `
            + `FROM bilive_record_stream `
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
        sql += `ORDER BY id DESC `
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