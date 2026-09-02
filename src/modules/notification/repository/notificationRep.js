const dbName = 'socket';
const defaultChannel = "__default_channel";

/**
 * 频道通知消息数据访问仓库
 */
export default {
    /**
     * 插入一条新的频道通知记录
     * @param {Object} data - 通知数据对象
     * @param {string} [data.channel] - 所属频道名称（缺省使用默认全局频道 `__default_channel`）
     * @param {string} data.message - 通知消息正文
     * @param {string} [data.extra] - 附加扩展信息 (如 JSON 字符串)
     * @param {string} [data.createBy] - 发送者/创建人标识
     * @returns {Promise<{ lastId: number, createTime: Date }>} 插入成功返回自增 ID 与创建时间
     */
    insertNotification: async ({ channel, message, extra, createBy }) => {
        const sql = "INSERT INTO channel_notification(channel, message, extra, create_by,create_time) VALUES(?,?,?,?,?)";
        const createTime = new Date();
        const params = [channel || defaultChannel, message, extra, createBy, createTime];
        return __sqliteDB.insert(sql, params, null, dbName).then(({ lastId }) => ({ lastId, createTime }));
    },

    /**
     * 分页/增量查询指定频道与全局默认频道的历史通知消息
     * @param {Object} query - 查询条件
     * @param {string} [query.channel] - 频道名称
     * @param {number} query.lastId - 增量起始 ID 游标 (查询 id > lastId 的记录)
     * @param {number} [limit=-1] - 查询限制条数 (-1 表示不限条数)
     * @returns {Promise<QueryResult<{ id: number, message: string, extra: string, createBy: string, createTime: string }>>}
     */
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
        return __sqliteDB.selectAll(sql, params, null, dbName);
    }
};