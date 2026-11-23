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
 * 密码金库安全审计日志数据访问仓库 (Phase 10: Vault Audit Repository)
 */
export default {
    /**
     * 写入审计日志记录
     * @param {{ uid: number, epoch: number, action: string, deviceId: string, detail?: string }} audit
     * @param {any} [tx]
     */
    insertAudit: ({ uid, epoch, action, deviceId, detail = null }, tx) => {
        const now = new Date().toISOString();
        const sql = `INSERT INTO vault_audit (uid, epoch, action, device_id, detail, create_time) `
            + `VALUES (?, ?, ?, ?, ?, ?)`;
        return getExecutor(tx).insert(sql, [
            uid,
            epoch || 1,
            action,
            deviceId || '',
            detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null,
            now
        ]);
    },

    /**
     * 查询指定用户的审计日志
     * @param {number} uid
     * @param {number} [limit=50]
     * @param {any} [tx]
     */
    selectAudits: (uid, limit = 50, tx) => {
        const sql = `SELECT id, uid, epoch, action, device_id AS deviceId, detail, create_time AS createTime `
            + `FROM vault_audit WHERE uid = ? ORDER BY id DESC LIMIT ?`;
        return getExecutor(tx).selectAll(sql, [uid, limit]);
    }
};
