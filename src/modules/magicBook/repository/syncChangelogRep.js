const dbName = 'magic_book';

const getExecutor = (tx) => {
    if (tx) {
        return {
            insert: (sql, params, opts) => tx.insert(sql, params, opts),
            update: (sql, params, opts) => tx.update(sql, params, opts),
            delete: (sql, params, opts) => tx.delete(sql, params, opts),
            selectAll: (sql, params, opts) => tx.selectAll(sql, params, opts),
            selectOne: (sql, params, opts) => tx.selectOne(sql, params, opts),
        };
    }
    return {
        insert: (sql, params, opts) => __sqliteDB.insert(sql, params, opts, dbName),
        update: (sql, params, opts) => __sqliteDB.update(sql, params, opts, dbName),
        delete: (sql, params, opts) => __sqliteDB.delete(sql, params, opts, dbName),
        selectAll: (sql, params, opts) => __sqliteDB.selectAll(sql, params, opts, dbName),
        selectOne: (sql, params, opts) => __sqliteDB.selectOne(sql, params, opts, dbName),
    };
};

/**
 * 变更流水单调递增日志数据访问仓库 (增量同步核心引擎 / 泛型流水模型)
 */
export default {
    /**
     * 根据起始游标范围扫描增量变更记录
     * @param {number} uid - 用户 ID
     * @param {number} cursor - 当前本地游标（返回 cursor > 该值的记录）
     * @param {number} limit - 最大拉取条数
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<QueryResult<{ cursor: number, deviceId: string, entityType: string, scopeType: string, scopeId: string, name: string, value: string, isDeleted: number, clientTimestamp: number, createTime: string }>>}
     */
    selectChangesAfterCursor: (uid, cursor = 0, limit = 100, tx) => {
        const sql = `SELECT cursor, device_id AS deviceId, entity_type AS entityType, `
            + `scope_type AS scopeType, scope_id AS scopeId, name, value, is_deleted AS isDeleted, `
            + `client_timestamp AS clientTimestamp, create_time AS createTime `
            + `FROM sync_changelog `
            + `WHERE uid = ? AND cursor > ? `
            + `ORDER BY cursor ASC `
            + `LIMIT ?`;
        return getExecutor(tx).selectAll(sql, [uid, cursor, limit]);
    },

    /**
     * 获取指定用户的最新全局变更游标
     * @param {number} uid - 用户 ID
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<number>} 最新 cursor，若无记录则返回 0
     */
    selectLatestCursor: async (uid, tx) => {
        const sql = `SELECT MAX(cursor) AS latestCursor FROM sync_changelog WHERE uid = ?`;
        const res = await getExecutor(tx).selectOne(sql, [uid]);
        return res?.latestCursor ? Number(res.latestCursor) : 0;
    },

    /**
     * 追加单条变更流水记录
     * @param {{ uid: number, deviceId: string, entityType: string, scopeType?: string, scopeId?: string, name?: string, value?: string, isDeleted?: number|boolean, clientTimestamp?: number }} item
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<ExecResult>} 包含新增的 lastId (即自增 cursor)
     */
    insertChangelog: ({ uid, deviceId, entityType, scopeType = null, scopeId = null, name = null, value = null, isDeleted = 0, clientTimestamp = Date.now() }, tx) => {
        const now = new Date().toISOString();
        const deletedFlag = isDeleted ? 1 : 0;
        const sql = `INSERT INTO sync_changelog (uid, device_id, entity_type, scope_type, scope_id, name, value, is_deleted, client_timestamp, create_time) `
            + `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        return getExecutor(tx).insert(sql, [
            uid,
            deviceId,
            entityType,
            scopeType,
            scopeId,
            name,
            value,
            deletedFlag,
            clientTimestamp,
            now
        ]);
    },

    /**
     * 清理过期流水记录
     * @param {string} expireTime - 截止时间 (ISO 字符串)
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<ExecResult>}
     */
    deleteChangelogBefore: (expireTime, tx) => {
        const sql = `DELETE FROM sync_changelog WHERE create_time < ?`;
        return getExecutor(tx).delete(sql, [expireTime]);
    }
};
