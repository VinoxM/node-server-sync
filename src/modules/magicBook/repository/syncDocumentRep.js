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
 * 配置文档最新态快照数据访问仓库 (CQRS 读侧视图)
 */
export default {
    /**
     * 查询指定用户下的文档快照列表
     * @param {number} uid - 用户 ID
     * @param {{ profileId?: string, scope?: string, includeDeleted?: boolean }} [options={}]
     * @param {any} [tx] - 可选事务句柄
     */
    selectDocuments: (uid, options = {}, tx) => {
        let sql = `SELECT id, uid, scope, profile_id AS profileId, name, value, `
            + `version, last_device_id AS lastDeviceId, is_deleted AS isDeleted, update_time AS updateTime `
            + `FROM sync_documents WHERE uid = ?`;
        const params = [uid];

        if (!options.includeDeleted) {
            sql += ` AND is_deleted = 0`;
        }

        if (options.scope) {
            sql += ` AND scope = ?`;
            params.push(options.scope);
        }

        if (options.profileId !== undefined && options.profileId !== null) {
            sql += ` AND (profile_id = ? OR scope = 'user')`;
            params.push(options.profileId);
        }

        sql += ` ORDER BY scope ASC, profile_id ASC, name ASC`;
        return getExecutor(tx).selectAll(sql, params);
    },

    /**
     * 查询单条配置文档快照
     * @param {number} uid - 用户 ID
     * @param {string} scope - 作用域 ('global'|'profile')
     * @param {string} profileId - 档案标识
     * @param {string} name - 文档键名
     * @param {any} [tx] - 可选事务句柄
     */
    selectDocument: (uid, scope, profileId, name, tx) => {
        const sql = `SELECT id, uid, scope, profile_id AS profileId, name, value, `
            + `version, last_device_id AS lastDeviceId, is_deleted AS isDeleted, update_time AS updateTime `
            + `FROM sync_documents WHERE uid = ? AND scope = ? AND profile_id = ? AND name = ?`;
        return getExecutor(tx).selectOne(sql, [uid, scope, profileId || '', name]);
    },

    /**
     * 写入或更新文档快照 (Upsert)
     * @param {{ uid: number, scope: string, profileId?: string, name: string, value: string, lastDeviceId?: string, isDeleted?: number|boolean }} doc
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<ExecResult>}
     */
    upsertDocument: ({ uid, scope, profileId = '', name, value, lastDeviceId = null, isDeleted = 0 }, tx) => {
        const now = new Date().toISOString();
        const deletedFlag = isDeleted ? 1 : 0;
        const sql = `INSERT INTO sync_documents (uid, scope, profile_id, name, value, version, last_device_id, is_deleted, update_time) `
            + `VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?) `
            + `ON CONFLICT(uid, scope, profile_id, name) DO UPDATE SET `
            + `value = excluded.value,`
            + `version = sync_documents.version + 1,`
            + `last_device_id = excluded.last_device_id,`
            + `is_deleted = excluded.is_deleted,`
            + `update_time = excluded.update_time`;
        return getExecutor(tx).insert(sql, [uid, scope, profileId || '', name, value, lastDeviceId, deletedFlag, now]);
    }
};

