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
 * 档案元数据数据访问仓库
 */
export default {
    /**
     * 查询指定用户的档案列表
     * @param {number} uid - 用户 ID
     * @param {boolean} [includeDeleted=false] - 是否包含已软删除的档案
     * @param {any} [tx] - 可选事务句柄
     */
    selectProfilesByUid: (uid, includeDeleted = false, tx) => {
        let sql = `SELECT id, uid, profile_id AS profileId, label, is_default AS isDefault, `
                   + `is_deleted AS isDeleted, version, update_time AS updateTime, create_time AS createTime `
                   + `FROM sync_profiles WHERE uid = ?`;
        const params = [uid];
        if (!includeDeleted) {
            sql += ` AND is_deleted = 0`;
        }
        sql += ` ORDER BY is_default DESC, id ASC`;
        return getExecutor(tx).selectAll(sql, params);
    },

    /**
     * 查询特定档案元数据
     * @param {number} uid - 用户 ID
     * @param {string} profileId - 档案标识
     * @param {any} [tx] - 可选事务句柄
     */
    selectProfile: (uid, profileId, tx) => {
        const sql = `SELECT id, uid, profile_id AS profileId, label, is_default AS isDefault, `
                     + `is_deleted AS isDeleted, version, update_time AS updateTime, create_time AS createTime `
                     + `FROM sync_profiles WHERE uid = ? AND profile_id = ?`;
        return getExecutor(tx).selectOne(sql, [uid, profileId]);
    },

    /**
     * 创建或覆盖激活档案 (Upsert)
     * @param {{ uid: number, profileId: string, label: string, isDefault?: number|boolean, version?: number }} profile
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<ExecResult>}
     */
    insertProfile: ({ uid, profileId, label, isDefault = 0, version = 1 }, tx) => {
        const now = new Date().toISOString();
        const def = isDefault ? 1 : 0;
        const sql = `INSERT INTO sync_profiles (uid, profile_id, label, is_default, is_deleted, version, update_time, create_time) `
            + `VALUES (?, ?, ?, ?, 0, ?, ?, ?) `
            + `ON CONFLICT(uid, profile_id) DO UPDATE SET `
            + `label = excluded.label, `
            + `is_default = excluded.is_default, `
            + `is_deleted = 0, `
            + `version = version + 1, `
            + `update_time = excluded.update_time `;
        return getExecutor(tx).insert(sql, [uid, profileId, label || '', def, version, now, now]);
    },

    /**
     * 重命名/更新档案名称
     * @param {number} uid - 用户 ID
     * @param {string} profileId - 档案标识
     * @param {string} label - 新名称
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<ExecResult>}
     */
    updateProfileLabel: (uid, profileId, label, tx) => {
        const now = new Date().toISOString();
        const sql = `UPDATE sync_profiles `
            + `SET label = ?, version = version + 1, update_time = ? `
            + `WHERE uid = ? AND profile_id = ? AND is_deleted = 0`;
        return getExecutor(tx).update(sql, [label, now, uid, profileId]);
    },

    /**
     * 软删除档案
     * @param {number} uid - 用户 ID
     * @param {string} profileId - 档案标识
     * @param {any} [tx] - 可选事务句柄
     * @returns {Promise<ExecResult>}
     */
    softDeleteProfile: (uid, profileId, tx) => {
        const now = new Date().toISOString();
        const sql = `UPDATE sync_profiles `
            + `SET is_deleted = 1, version = version + 1, update_time = ? `
            + `WHERE uid = ? AND profile_id = ?`;
        return getExecutor(tx).update(sql, [now, uid, profileId]);
    }
};

