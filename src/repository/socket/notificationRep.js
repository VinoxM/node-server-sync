const dbName = 'socket';
const defaultChannel = "__default_channel";

export default {
    insertNotification: ({ channel, message, extra, createBy }) => {
        const sql = "INSERT INTO channel_notification(channel, message, extra, create_by,create_time) VALUES(?,?,?,?,?)";
        const createTime = new Date();
        const params = [channel || defaultChannel, message, extra, createBy, createTime];
        return sqliteDB.insert(sql, params, null, dbName).then(({ lastId }) => ({ lastId, createTime }));
    },
    selectNotification: ({ channel, lastId }, limit = -1) => {
        let sql = "SELECT id, message, extra, create_by createBy, create_time createTime FROM channel_notification ";
        const params = [];
        sql += "WHERE channel";
        channel ? (sql += ' IN (?,?)', params.push(channel, defaultChannel)) : (sql += '=?', params.push(defaultChannel));
        sql += " AND id>? ORDER BY id";
        params.push(lastId);
        if (limit > 0) {
            sql = "SELECT * FROM(" + sql;
            sql += " DESC limit 0,?) ORDER BY ID";
            params.push(limit);
        }
        return sqliteDB.selectAll(sql, params, null, dbName);
    }
}