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
 * 配置文档最新态快照数据访问仓库 (CQRS 读侧视图 / 泛型二维作用域模型)
 */
export default {
    /**
     * 查询指定用户下的文档快照列表
     * @param {number} uid - 用户 ID
     * @param {{ scopeType?: string, scopeId?: string, profileId?: string, scope?: string, includeDeleted?: boolean }} [options={}]
     * @param {any} [tx] - 可选事务句柄
     */
    selectDocuments: (uid, options = {}, tx) => {
        let sql = `SELECT id, uid, scope_type AS scopeType, scope_id AS scopeId, name, value, `
            + `version, last_device_id AS lastDeviceId, is_deleted AS isDeleted, update_time AS updateTime `
            + `FROM sync_documents WHERE uid = ?`;
        const params = [uid];

        if (!options.includeDeleted) {
            sql += ` AND is_deleted = 0`;
        }

        const scopeType = options.scopeType || options.scope;
        if (scopeType) {
            sql += ` AND scope_type = ?`;
            params.push(scopeType);
        }

        if (options.scopeId !== undefined && options.scopeId !== null) {
            sql += ` AND scope_id = ?`;
            params.push(options.scopeId);
        } else if (options.profileId !== undefined && options.profileId !== null) {
            // 向下兼容：根据 profileId 匹配用户下的档案 (uid:profileId) 或特定 scopeId，或属于该用户的 user 级配置
            sql += ` AND (scope_id = ? OR scope_id = ? OR scope_type = 'user')`;
            params.push(`${uid}:${options.profileId}`, options.profileId);
        }

        sql += ` ORDER BY scope_type ASC, scope_id ASC, name ASC`;
        return getExecutor(tx).selectAll(sql, params);
    },

    /**
     * 查询单条配置文档快照 (按泛型二维主键点查)
     * @param {number} uid - 用户 ID
     * @param {string} scopeType - 作用域类型 ('user'|'profile'|'org'|'device'等)
     * @param {string} scopeId - 作用域标识 ('1', '1:profiles', 'org_123'等)
     * @param {string} name - 文档键名
     * @param {any} [tx] - 可选事务句柄
     */
    selectDocument: (uid, scopeType, scopeId, name, tx) => {
        const sql = `SELECT id, uid, scope_type AS scopeType, scope_id AS scopeId, name, value, `
            + `version, last_device_id AS lastDeviceId, is_deleted AS isDeleted, update_time AS updateTime `
            + `FROM sync_documents WHERE uid = ? AND scope_type = ? AND scope_id = ? AND name = ?`;
        return getExecutor(tx).selectOne(sql, [uid, scopeType, scopeId, name]);
    },

    /**
     * 写入或更新文档快照 (Upsert)
     * @param {{ uid: number, scopeType: string, scopeId: string, name: string, value: string, lastDeviceId?: string, isDeleted?: number|boolean }} doc
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<ExecResult>}
     */
    upsertDocument: ({ uid, scopeType, scopeId, name, value, lastDeviceId = null, isDeleted = 0 }, tx) => {
        const now = new Date().toISOString();
        const deletedFlag = isDeleted ? 1 : 0;
        const sql = `INSERT INTO sync_documents (uid, scope_type, scope_id, name, value, version, last_device_id, is_deleted, update_time) `
            + `VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?) `
            + `ON CONFLICT(uid, scope_type, scope_id, name) DO UPDATE SET `
            + `value = excluded.value,`
            + `version = sync_documents.version + 1,`
            + `last_device_id = excluded.last_device_id,`
            + `is_deleted = excluded.is_deleted,`
            + `update_time = excluded.update_time`;
        return getExecutor(tx).insert(sql, [uid, scopeType, scopeId, name, value, lastDeviceId, deletedFlag, now]);
    }
};
