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
 * 密码金库条目密文快照数据访问仓库 (Phase 10: Vault Entries Repository)
 */
export default {
    /**
     * 查询指定单条凭据密文
     * @param {number} uid
     * @param {string} id - 条目 UUID
     * @param {any} [tx]
     */
    selectEntry: (uid, id, tx) => {
        const sql = `SELECT id, uid, epoch, cipher, client_version AS clientVersion, `
            + `key_id AS keyId, is_deleted AS isDeleted, update_time AS updateTime `
            + `FROM vault_entries WHERE uid = ? AND id = ?`;
        return getExecutor(tx).selectOne(sql, [uid, id]);
    },

    /**
     * 单条写入或更新 (UPSERT)
     * @param {{ id: string, uid: number, epoch: number, cipher: string, clientVersion?: number, keyId: string, isDeleted?: number|boolean }} entry
     * @param {any} [tx]
     */
    upsertEntry: (entry, tx) => {
        const now = new Date().toISOString();
        const deletedFlag = entry.isDeleted ? 1 : 0;
        const sql = `INSERT INTO vault_entries (id, uid, epoch, cipher, client_version, key_id, is_deleted, update_time) `
            + `VALUES (?, ?, ?, ?, ?, ?, ?, ?) `
            + `ON CONFLICT (uid, id) DO UPDATE SET `
            + `epoch = excluded.epoch, `
            + `cipher = excluded.cipher, `
            + `client_version = excluded.client_version, `
            + `key_id = excluded.key_id, `
            + `is_deleted = excluded.is_deleted, `
            + `update_time = excluded.update_time`;
        return getExecutor(tx).insert(sql, [
            entry.id,
            entry.uid,
            entry.epoch,
            entry.cipher,
            entry.clientVersion || 1,
            entry.keyId,
            deletedFlag,
            now
        ]);
    },

    /**
     * 批量导入写入 (UPSERT)
     * @param {Array<object>} entries
     * @param {any} [tx]
     */
    upsertEntries: async (entries, tx) => {
        for (const entry of entries) {
            const now = new Date().toISOString();
            const deletedFlag = entry.isDeleted || entry.is_deleted ? 1 : 0;
            const sql = `INSERT INTO vault_entries (id, uid, epoch, cipher, client_version, key_id, is_deleted, update_time) `
                + `VALUES (?, ?, ?, ?, ?, ?, ?, ?) `
                + `ON CONFLICT (uid, id) DO UPDATE SET `
                + `epoch = excluded.epoch, `
                + `cipher = excluded.cipher, `
                + `client_version = excluded.client_version, `
                + `key_id = excluded.key_id, `
                + `is_deleted = excluded.is_deleted, `
                + `update_time = excluded.update_time`;
            await getExecutor(tx).insert(sql, [
                entry.id,
                entry.uid,
                entry.epoch,
                entry.cipher,
                entry.clientVersion || entry.client_version || 1,
                entry.keyId || entry.key_id || '',
                deletedFlag,
                now
            ]);
        }
    },

    /**
     * Keyset 游标高效分页查询活跃条目 (杜绝 OFFSET 漂移，仅拉取 is_deleted = 0)
     * @param {number} uid
     * @param {number} epoch
     * @param {string|null} pageToken - 上一页最后一条的 id
     * @param {number} limit
     * @param {any} [tx]
     */
    selectEntriesKeyset: (uid, epoch, pageToken = null, limit = 200, tx) => {
        let sql = `SELECT id, cipher, key_id AS keyId, client_version AS clientVersion, update_time AS updateTime `
            + `FROM vault_entries `
            + `WHERE uid = ? AND epoch = ? AND is_deleted = 0 `;
        const params = [uid, epoch];

        if (pageToken) {
            sql += `AND id > ? `;
            params.push(pageToken);
        }

        sql += `ORDER BY id ASC LIMIT ?`;
        params.push(limit);

        return getExecutor(tx).selectAll(sql, params);
    },

    /**
     * 统计指定用户当前纪元活跃凭据条数
     * @param {number} uid
     * @param {number} [epoch]
     * @param {any} [tx]
     */
    countActiveEntries: async (uid, epoch, tx) => {
        let sql = `SELECT COUNT(1) AS count FROM vault_entries WHERE uid = ? AND is_deleted = 0`;
        const params = [uid];
        if (epoch !== undefined && epoch !== null) {
            sql += ` AND epoch = ?`;
            params.push(epoch);
        }
        const res = await getExecutor(tx).selectOne(sql, params);
        return res?.count ? Number(res.count) : 0;
    },

    /**
     * 统计指定用户所有非删除凭据密文总字节数
     * @param {number} uid
     * @param {any} [tx]
     */
    calculateTotalCipherBytes: async (uid, tx) => {
        const sql = `SELECT SUM(LENGTH(cipher)) AS totalBytes FROM vault_entries WHERE uid = ? AND is_deleted = 0`;
        const res = await getExecutor(tx).selectOne(sql, [uid]);
        return res?.totalBytes ? Number(res.totalBytes) : 0;
    },

    /**
     * 软删除指定用户指定纪元的所有条目
     * @param {number} uid
     * @param {number} epoch
     * @param {any} [tx]
     */
    softDeleteAllByEpoch: (uid, epoch, tx) => {
        const now = new Date().toISOString();
        const sql = `UPDATE vault_entries SET is_deleted = 1, update_time = ? WHERE uid = ? AND epoch = ?`;
        return getExecutor(tx).update(sql, [now, uid, epoch]);
    }
};
