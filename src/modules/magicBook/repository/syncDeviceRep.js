const dbName = 'magic_book';

/**
 * 统一执行器分发辅助函数（支持事务透传）
 */
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
 * 客户端设备与会话状态数据访问仓库
 */
export default {
    /**
     * 查询指定用户的所有设备列表
     * @param {number} uid - 用户 ID
     * @returns {Promise<QueryResult<{ id: number, uid: number, deviceId: string, deviceName: string, platform: string, lastActiveTime: string, createTime: string, tokenHash?: string }>>}
     */
    selectDevicesByUid: (uid) => {
        const sql = `SELECT id, uid, device_id AS deviceId, device_name AS deviceName, platform, `
                     + `last_active_time AS lastActiveTime, create_time AS createTime, token_hash AS tokenHash `
                     + `FROM sync_devices WHERE uid = ? ORDER BY last_active_time DESC`;
        return __sqliteDB.selectAll(sql, [uid], null, dbName);
    },

    /**
     * 查询指定用户的某台设备信息
     * @param {number} uid - 用户 ID
     * @param {string} deviceId - 设备唯一标识
     * @param {any} [tx] - 可选事务句柄
     */
    selectDevice: (uid, deviceId, tx) => {
        const sql = `SELECT id, uid, device_id AS deviceId, device_name AS deviceName, platform, `
                     + `last_active_time AS lastActiveTime, create_time AS createTime, token_hash AS tokenHash `
                     + `FROM sync_devices WHERE uid = ? AND device_id = ?`;
        return getExecutor(tx).selectOne(sql, [uid, deviceId]);
    },

    /**
     * 设备登记或更新（Upsert）
     * @param {{ uid: number, deviceId: string, deviceName: string, platform: string, lastActiveTime?: string, createTime?: string, tokenHash?: string }} device
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<ExecResult>}
     */
    upsertDevice: ({ uid, deviceId, deviceName, platform, lastActiveTime, createTime, tokenHash = null }, tx) => {
        const now = new Date().toISOString();
        const activeTime = lastActiveTime || now;
        const cTime = createTime || now;
        const sql = `INSERT INTO sync_devices (uid, device_id, device_name, platform, last_active_time, create_time, token_hash) `
            + `VALUES (?, ?, ?, ?, ?, ?, ?) `
            + `ON CONFLICT(uid, device_id) DO UPDATE SET `
            + `device_name = excluded.device_name, `
            + `platform = excluded.platform, `
            + `last_active_time = excluded.last_active_time, `
            + `token_hash = COALESCE(excluded.token_hash, sync_devices.token_hash) `;
        return getExecutor(tx).insert(sql, [uid, deviceId, deviceName, platform, activeTime, cTime, tokenHash]);
    },

    /**
     * 移除指定设备记录
     * @param {number} uid - 用户 ID
     * @param {string} deviceId - 设备标识
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<ExecResult>}
     */
    deleteDevice: (uid, deviceId, tx) => {
        const sql = `DELETE FROM sync_devices WHERE uid = ? AND device_id = ?`;
        return getExecutor(tx).delete(sql, [uid, deviceId]);
    },

    /**
     * 更新设备最后活跃时间
     * @param {number} uid - 用户 ID
     * @param {string} deviceId - 设备标识
     * @param {string} [lastActiveTime] - 活跃时间（默认当前时间）
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<ExecResult>}
     */
    updateActiveTime: (uid, deviceId, lastActiveTime, tx) => {
        const activeTime = lastActiveTime || new Date().toISOString();
        const sql = `UPDATE sync_devices SET last_active_time = ? WHERE uid = ? AND device_id = ?`;
        return getExecutor(tx).update(sql, [activeTime, uid, deviceId]);
    }
};

