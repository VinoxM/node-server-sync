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
 * 密码金库信封元数据数据访问仓库 (Phase 10: Vault Meta Repository)
 */
export default {
    /**
     * 查询指定用户的金库信封元数据
     * @param {number} uid - 用户 ID
     * @param {any} [tx] - 可选事务句柄
     */
    selectMeta: (uid, tx) => {
        const sql = `SELECT uid, epoch, version, state, key_id AS keyId, `
            + `kdf_alg AS kdfAlg, kdf_iterations AS kdfIterations, kdf_salt AS kdfSalt, `
            + `wrapped_dek AS wrappedDek, recovery_wrapped_dek AS recoveryWrappedDek, `
            + `recovery_salt AS recoverySalt, recovery_iterations AS recoveryIterations, `
            + `content_hash AS contentHash, last_device_id AS lastDeviceId, `
            + `update_time AS updateTime, create_time AS createTime `
            + `FROM vault_meta WHERE uid = ?`;
        return getExecutor(tx).selectOne(sql, [uid]);
    },

    /**
     * 初始化插入用户金库信封
     * @param {object} meta
     * @param {any} [tx]
     */
    insertMeta: (meta, tx) => {
        const now = meta.createTime || new Date().toISOString();
        const sql = `INSERT INTO vault_meta (uid, epoch, version, state, key_id, `
            + `kdf_alg, kdf_iterations, kdf_salt, wrapped_dek, recovery_wrapped_dek, `
            + `recovery_salt, recovery_iterations, content_hash, last_device_id, update_time, create_time) `
            + `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        return getExecutor(tx).insert(sql, [
            meta.uid,
            meta.epoch || 1,
            meta.version || 1,
            meta.state || 'ACTIVE',
            meta.keyId,
            meta.kdfAlg || 'pbkdf2-sha256',
            meta.kdfIterations,
            meta.kdfSalt,
            meta.wrappedDek,
            meta.recoveryWrappedDek ?? null,
            meta.recoverySalt ?? null,
            meta.recoveryIterations ?? null,
            meta.contentHash ?? null,
            meta.lastDeviceId ?? null,
            meta.updateTime || now,
            now
        ]);
    },

    /**
     * 基于 CAS 乐观锁条件更新信封数据 (WHERE uid = ? AND version = ?)
     * @param {number} uid
     * @param {number} expectedVersion
     * @param {object} meta
     * @param {any} [tx]
     * @returns {Promise<ExecResult>} 返回受到影响的行数，0 行表示版本失配 (409 Conflict)
     */
    updateMetaCas: (uid, expectedVersion, meta, tx) => {
        const now = new Date().toISOString();
        const sql = `UPDATE vault_meta SET `
            + `epoch = ?, `
            + `version = version + 1, `
            + `state = ?, `
            + `key_id = ?, `
            + `kdf_alg = ?, `
            + `kdf_iterations = ?, `
            + `kdf_salt = ?, `
            + `wrapped_dek = ?, `
            + `recovery_wrapped_dek = ?, `
            + `recovery_salt = ?, `
            + `recovery_iterations = ?, `
            + `content_hash = ?, `
            + `last_device_id = ?, `
            + `update_time = ? `
            + `WHERE uid = ? AND version = ?`;
        return getExecutor(tx).update(sql, [
            meta.epoch,
            meta.state || 'ACTIVE',
            meta.keyId,
            meta.kdfAlg || 'pbkdf2-sha256',
            meta.kdfIterations,
            meta.kdfSalt,
            meta.wrappedDek,
            meta.recoveryWrappedDek ?? null,
            meta.recoverySalt ?? null,
            meta.recoveryIterations ?? null,
            meta.contentHash ?? null,
            meta.lastDeviceId ?? null,
            now,
            uid,
            expectedVersion
        ]);
    },

    /**
     * 金库改密轮转 (验证旧 key_id 并更新新密文包裹)
     * @param {number} uid
     * @param {string} oldKeyId
     * @param {object} newMeta
     * @param {any} [tx]
     * @returns {Promise<ExecResult>}
     */
    updateRotate: (uid, oldKeyId, newMeta, tx) => {
        const now = new Date().toISOString();
        const sql = `UPDATE vault_meta SET `
            + `version = version + 1, `
            + `key_id = ?, `
            + `kdf_iterations = ?, `
            + `kdf_salt = ?, `
            + `wrapped_dek = ?, `
            + `recovery_wrapped_dek = ?, `
            + `recovery_salt = ?, `
            + `recovery_iterations = ?, `
            + `last_device_id = ?, `
            + `update_time = ? `
            + `WHERE uid = ? AND key_id = ?`;
        return getExecutor(tx).update(sql, [
            newMeta.keyId,
            newMeta.kdfIterations,
            newMeta.kdfSalt,
            newMeta.wrappedDek,
            newMeta.recoveryWrappedDek ?? null,
            newMeta.recoverySalt ?? null,
            newMeta.recoveryIterations ?? null,
            newMeta.lastDeviceId ?? null,
            now,
            uid,
            oldKeyId
        ]);
    },

    /**
     * 重置金库元数据（Epoch 递增，清空旧包裹）
     * @param {number} uid
     * @param {number} newEpoch
     * @param {any} [tx]
     */
    resetVault: (uid, newEpoch, tx) => {
        const now = new Date().toISOString();
        const sql = `UPDATE vault_meta SET `
            + `epoch = ?, `
            + `version = 1, `
            + `state = 'ACTIVE', `
            + `key_id = '', `
            + `wrapped_dek = '', `
            + `recovery_wrapped_dek = NULL, `
            + `recovery_salt = NULL, `
            + `recovery_iterations = NULL, `
            + `content_hash = NULL, `
            + `update_time = ? `
            + `WHERE uid = ?`;
        return getExecutor(tx).update(sql, [newEpoch, now, uid]);
    }
};
