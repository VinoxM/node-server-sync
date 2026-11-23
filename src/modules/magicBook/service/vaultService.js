import vaultMetaRep from '../repository/vaultMetaRep.js';
import vaultEntryRep from '../repository/vaultEntryRep.js';
import vaultAuditRep from '../repository/vaultAuditRep.js';
import syncChangelogRep from '../repository/syncChangelogRep.js';
import syncDeviceRep from '../repository/syncDeviceRep.js';
import { SYNC_ENTITY_TYPE, VAULT_CONFIG, VAULT_ERROR_CODE } from '../constants/magicBookConst.js';

const dbName = 'magic_book';

/**
 * 校验 KDF 参数是否达到最低安全基线
 * @param {string} kdfAlg
 * @param {number} iterations
 * @param {string} salt
 */
const validateKdfSecurityBaseline = (kdfAlg, iterations, salt) => {
    const alg = (kdfAlg || 'pbkdf2-sha256').toLowerCase();
    if (!VAULT_CONFIG.ALLOWED_KDF_ALGS.includes(alg)) {
        throw {
            msg: `Disallowed KDF algorithm: ${kdfAlg}. Allowed: ${VAULT_CONFIG.ALLOWED_KDF_ALGS.join(', ')}`,
            code: VAULT_ERROR_CODE.KDF_PARAM_INSECURE,
            status: 400
        };
    }

    if (alg === 'pbkdf2-sha256') {
        const iter = Number(iterations);
        if (isNaN(iter) || iter < VAULT_CONFIG.MIN_PBKDF2_ITERATIONS) {
            throw {
                msg: `PBKDF2 iterations must be at least ${VAULT_CONFIG.MIN_PBKDF2_ITERATIONS}, received: ${iterations}`,
                code: VAULT_ERROR_CODE.KDF_PARAM_INSECURE,
                status: 400
            };
        }
    }

    if (!salt || typeof salt !== 'string') {
        throw {
            msg: 'KDF salt is required.',
            code: VAULT_ERROR_CODE.KDF_PARAM_INSECURE,
            status: 400
        };
    }

    try {
        const saltBuffer = Buffer.from(salt, 'base64');
        if (saltBuffer.length < VAULT_CONFIG.MIN_SALT_BYTES) {
            throw {
                msg: `Salt length must be at least ${VAULT_CONFIG.MIN_SALT_BYTES} bytes, received: ${saltBuffer.length}`,
                code: VAULT_ERROR_CODE.KDF_PARAM_INSECURE,
                status: 400
            };
        }
    } catch (e) {
        if (e.code === VAULT_ERROR_CODE.KDF_PARAM_INSECURE) throw e;
        throw {
            msg: 'Invalid base64 KDF salt string.',
            code: VAULT_ERROR_CODE.KDF_PARAM_INSECURE,
            status: 400
        };
    }
};

/**
 * 密码金库核心业务服务 (Phase 10: Vault E2EE Sync Backend Service)
 */
export default {
    /**
     * 获取指定用户的金库元数据探测状态 (自愈状态机探测入口)
     * @param {number} uid
     */
    getVaultStatus: async (uid) => {
        const meta = await vaultMetaRep.selectMeta(uid);
        if (!meta) {
            return { exists: false };
        }

        const activeCount = await vaultEntryRep.countActiveEntries(uid, meta.epoch);
        const kdfUpgradeRequired = Boolean(meta.kdfIterations && meta.kdfIterations < VAULT_CONFIG.MIN_PBKDF2_ITERATIONS);

        return {
            exists: true,
            epoch: meta.epoch,
            key_id: meta.keyId,
            version: meta.version,
            content_hash: meta.contentHash || null,
            state: meta.state || 'ACTIVE',
            entry_count: activeCount,
            kdf_upgrade_required: kdfUpgradeRequired,
            updated_at: meta.updateTime
        };
    },

    /**
     * 云端完整信封只读下发
     * @param {number} uid
     */
    getVaultEnvelope: async (uid) => {
        const meta = await vaultMetaRep.selectMeta(uid);
        if (!meta) {
            throw {
                msg: 'Vault envelope has not been initialized for this user.',
                code: VAULT_ERROR_CODE.VAULT_NOT_FOUND,
                status: 404
            };
        }

        return {
            exists: true,
            epoch: meta.epoch,
            version: meta.version,
            key_id: meta.keyId,
            kdf_alg: meta.kdfAlg,
            kdf_iterations: meta.kdfIterations,
            kdf_salt: meta.kdfSalt,
            wrapped_dek: meta.wrappedDek,
            recovery_wrapped_dek: meta.recoveryWrappedDek || null,
            recovery_salt: meta.recoverySalt || null,
            recovery_iterations: meta.recoveryIterations || null,
            content_hash: meta.contentHash || null,
            state: meta.state || 'ACTIVE',
            update_time: meta.updateTime
        };
    },

    /**
     * 保存或基于 CAS 乐观锁条件更新信封数据
     * @param {number} uid
     * @param {string} deviceId
     * @param {object} payload
     */
    saveOrUpdateEnvelope: async (uid, deviceId, payload) => {
        const keyId = payload.key_id || payload.keyId;
        const wrappedDek = payload.wrapped_dek || payload.wrappedDek;
        const kdfAlg = payload.kdf_alg || payload.kdfAlg || 'pbkdf2-sha256';
        const kdfIterations = Number(payload.kdf_iterations ?? payload.kdfIterations);
        const kdfSalt = payload.kdf_salt || payload.kdfSalt;

        __isBlank(keyId) && __throwMessage('key_id is required.', -1, 400);
        __isBlank(wrappedDek) && __throwMessage('wrapped_dek is required.', -1, 400);

        validateKdfSecurityBaseline(kdfAlg, kdfIterations, kdfSalt);

        const recoveryWrappedDek = payload.recovery_wrapped_dek ?? payload.recoveryWrappedDek ?? null;
        const recoverySalt = payload.recovery_salt ?? payload.recoverySalt ?? null;
        const recoveryIterations = payload.recovery_iterations ?? payload.recoveryIterations ?? null;
        const contentHash = payload.content_hash ?? payload.contentHash ?? null;
        const epoch = Number(payload.epoch) || 1;

        return __sqliteDB.getTransactionDB(async (tx) => {
            const current = await vaultMetaRep.selectMeta(uid, tx);

            if (!current) {
                // 初次创建信封
                await vaultMetaRep.insertMeta({
                    uid,
                    epoch,
                    version: 1,
                    state: 'ACTIVE',
                    keyId,
                    kdfAlg,
                    kdfIterations,
                    kdfSalt,
                    wrappedDek,
                    recoveryWrappedDek,
                    recoverySalt,
                    recoveryIterations,
                    contentHash,
                    lastDeviceId: deviceId
                }, tx);

                await vaultAuditRep.insertAudit({
                    uid,
                    epoch,
                    action: 'ENVELOPE_CREATE',
                    deviceId,
                    detail: JSON.stringify({ key_id: keyId, kdf_alg: kdfAlg, version: 1 })
                }, tx);

                return { ok: true, version: 1 };
            }

            // 已存在，执行 CAS 乐观锁更新
            const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
            if (isNaN(expectedVersion)) {
                throw {
                    msg: 'expected_version is required for envelope update.',
                    code: -1,
                    status: 400
                };
            }

            const updateRes = await vaultMetaRep.updateMetaCas(uid, expectedVersion, {
                epoch,
                state: 'ACTIVE',
                keyId,
                kdfAlg,
                kdfIterations,
                kdfSalt,
                wrappedDek,
                recoveryWrappedDek,
                recoverySalt,
                recoveryIterations,
                contentHash,
                lastDeviceId: deviceId
            }, tx);

            if (!updateRes || updateRes.rows === 0) {
                // 冲突：查询最新云端信封返回
                const latest = await vaultMetaRep.selectMeta(uid, tx);
                __throwWithData('Vault envelope version mismatch.', VAULT_ERROR_CODE.VERSION_CONFLICT, 409, {
                    current_envelope: {
                        epoch: latest.epoch,
                        version: latest.version,
                        key_id: latest.keyId,
                        wrapped_dek: latest.wrappedDek,
                        recovery_wrapped_dek: latest.recoveryWrappedDek,
                        kdf_alg: latest.kdfAlg,
                        kdf_iterations: latest.kdfIterations,
                        kdf_salt: latest.kdfSalt,
                        recovery_salt: latest.recoverySalt,
                        recovery_iterations: latest.recoveryIterations,
                        content_hash: latest.contentHash,
                        state: latest.state,
                        update_time: latest.updateTime
                    }
                });
            }

            await vaultAuditRep.insertAudit({
                uid,
                epoch,
                action: 'ENVELOPE_UPDATE',
                deviceId,
                detail: JSON.stringify({ key_id: keyId, expected_version: expectedVersion, new_version: expectedVersion + 1 })
            }, tx);

            return { ok: true, version: expectedVersion + 1 };
        }, null, dbName);
    },

    /**
     * 金库改密轮转 (验证旧 key_id 并更新新密文包裹)
     * @param {number} uid
     * @param {string} deviceId
     * @param {object} payload
     */
    rotateEnvelope: async (uid, deviceId, payload) => {
        const oldKeyId = payload.old_key_id || payload.oldKeyId;
        const newKeyId = payload.new_key_id || payload.newKeyId;
        const newWrappedDek = payload.new_wrapped_dek || payload.newWrappedDek;
        const newSalt = payload.new_salt || payload.newSalt;
        const newIterations = Number(payload.new_iterations ?? payload.newIterations);

        __isBlank(oldKeyId) && __throwMessage('old_key_id is required.', -1, 400);
        __isBlank(newKeyId) && __throwMessage('new_key_id is required.', -1, 400);
        __isBlank(newWrappedDek) && __throwMessage('new_wrapped_dek is required.', -1, 400);

        validateKdfSecurityBaseline('pbkdf2-sha256', newIterations, newSalt);

        const newRecoveryWrappedDek = payload.new_recovery_wrapped_dek ?? payload.newRecoveryWrappedDek ?? null;
        const newRecoverySalt = payload.new_recovery_salt ?? payload.newRecoverySalt ?? null;
        const newRecoveryIterations = payload.new_recovery_iterations ?? payload.newRecoveryIterations ?? null;

        return __sqliteDB.getTransactionDB(async (tx) => {
            const current = await vaultMetaRep.selectMeta(uid, tx);
            if (!current) {
                throw {
                    msg: 'Vault envelope not found.',
                    code: VAULT_ERROR_CODE.VAULT_NOT_FOUND,
                    status: 404
                };
            }

            if (current.keyId !== oldKeyId) {
                throw {
                    msg: `Old key_id mismatch. Server has: ${current.keyId}, received: ${oldKeyId}`,
                    code: VAULT_ERROR_CODE.VERSION_CONFLICT,
                    status: 409,
                    data: { current_envelope: current }
                };
            }

            await vaultMetaRep.updateRotate(uid, oldKeyId, {
                keyId: newKeyId,
                kdfIterations: newIterations,
                kdfSalt: newSalt,
                wrappedDek: newWrappedDek,
                recoveryWrappedDek: newRecoveryWrappedDek,
                recoverySalt: newRecoverySalt,
                recoveryIterations: newRecoveryIterations,
                lastDeviceId: deviceId
            }, tx);

            await vaultAuditRep.insertAudit({
                uid,
                epoch: current.epoch,
                action: 'ENVELOPE_ROTATE',
                deviceId,
                detail: JSON.stringify({ from_key_id: oldKeyId, to_key_id: newKeyId, version: current.version + 1 })
            }, tx);

            return { ok: true, version: current.version + 1 };
        }, null, dbName);
    },

    /**
     * 重置金库 (防重置炸弹核心：单事务内 epoch+1、软删旧条目、清空旧信封，物理删除旧 vault changelog)
     * @param {number} uid
     * @param {string} deviceId
     * @param {object} payload
     */
    resetVault: async (uid, deviceId, payload) => {
        if (payload?.confirm !== 'RESET') {
            throw {
                msg: 'Field confirm must be string "RESET".',
                code: VAULT_ERROR_CODE.RESET_CONFIRM_REQUIRED,
                status: 400
            };
        }

        return __sqliteDB.getTransactionDB(async (tx) => {
            const current = await vaultMetaRep.selectMeta(uid, tx);
            const currentEpoch = current ? Number(current.epoch) : 1;
            const newEpoch = currentEpoch + 1;

            // 1. 软删除旧纪元所有凭据条目
            await vaultEntryRep.softDeleteAllByEpoch(uid, currentEpoch, tx);

            // 2. 物理清除所有历史 vault changelog，防旧设备拉取复活
            await syncChangelogRep.deleteChangelogByEntityType(uid, SYNC_ENTITY_TYPE.VAULT, tx);

            // 3. 重置 vault_meta 纪元并清空密文
            if (current) {
                await vaultMetaRep.resetVault(uid, newEpoch, tx);
            } else {
                await vaultMetaRep.insertMeta({
                    uid,
                    epoch: newEpoch,
                    version: 1,
                    state: 'ACTIVE',
                    keyId: '',
                    kdfAlg: 'pbkdf2-sha256',
                    kdfIterations: VAULT_CONFIG.MIN_PBKDF2_ITERATIONS,
                    kdfSalt: '',
                    wrappedDek: '',
                    lastDeviceId: deviceId
                }, tx);
            }

            // 4. 记录重置审计日志
            await vaultAuditRep.insertAudit({
                uid,
                epoch: newEpoch,
                action: 'VAULT_RESET',
                deviceId,
                detail: JSON.stringify({ from_epoch: currentEpoch, to_epoch: newEpoch })
            }, tx);

            return { ok: true, epoch: newEpoch };
        }, null, dbName);
    },

    /**
     * Keyset 游标分页拉取凭据快照 (单页上限 200 条，杜绝 OFFSET 漂移与爆内存)
     * @param {number} uid
     * @param {object} payload
     */
    getSnapshot: async (uid, payload = {}) => {
        const epoch = payload.epoch !== undefined ? Number(payload.epoch) : 1;
        const limit = Math.min(Math.max(1, Number(payload.limit) || VAULT_CONFIG.DEFAULT_PAGE_SIZE), VAULT_CONFIG.MAX_PAGE_SIZE);
        const pageToken = payload.page_token || payload.pageToken || null;

        // 查询 limit + 1 条判断是否有下一页
        const queryRes = await vaultEntryRep.selectEntriesKeyset(uid, epoch, pageToken, limit + 1);
        const rawList = queryRes?.data || [];

        const hasMore = rawList.length > limit;
        const items = hasMore ? rawList.slice(0, limit) : rawList;
        const nextPageToken = hasMore && items.length > 0 ? items[items.length - 1].id : null;
        const total = await vaultEntryRep.countActiveEntries(uid, epoch);

        const formattedItems = items.map(item => ({
            id: item.id,
            cipher: item.cipher,
            key_id: item.keyId,
            client_version: Number(item.clientVersion),
            update_time: item.updateTime
        }));

        return {
            items: formattedItems,
            next_page_token: nextPageToken,
            total
        };
    },

    /**
     * 访客迁移导入 (单批 ≤ 200 条，幂等防重，同一事务内批量写 entries 并级联写 changelog)
     * @param {number} uid
     * @param {string} deviceId
     * @param {object} payload
     */
    importEntries: async (uid, deviceId, payload = {}) => {
        __isBlank(deviceId) && __throwMessage('device_id is required.', -1, 400);

        const entries = payload.entries;
        if (!Array.isArray(entries) || entries.length === 0) {
            return { ok: true, imported: 0 };
        }

        if (entries.length > VAULT_CONFIG.MAX_IMPORT_BATCH_SIZE) {
            throw {
                msg: `Batch size exceeds limit: maximum ${VAULT_CONFIG.MAX_IMPORT_BATCH_SIZE} entries per request.`,
                code: VAULT_ERROR_CODE.PAYLOAD_TOO_LARGE,
                status: 400
            };
        }

        const epoch = payload.epoch !== undefined ? Number(payload.epoch) : 1;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        return __sqliteDB.getTransactionDB(async (tx) => {
            const meta = await vaultMetaRep.selectMeta(uid, tx);
            if (meta && epoch < Number(meta.epoch)) {
                throw {
                    msg: 'Epoch stale during import. Vault has been reset.',
                    code: VAULT_ERROR_CODE.EPOCH_STALE,
                    status: 409,
                    data: { current_epoch: meta.epoch }
                };
            }

            // 配额硬检查
            const currentCount = await vaultEntryRep.countActiveEntries(uid, epoch, tx);
            if (currentCount + entries.length > VAULT_CONFIG.MAX_ENTRIES_PER_USER) {
                throw {
                    msg: `Quota exceeded: maximum ${VAULT_CONFIG.MAX_ENTRIES_PER_USER} entries per user.`,
                    code: VAULT_ERROR_CODE.QUOTA_EXCEEDED,
                    status: 400
                };
            }

            // 批量合法性校验与双写
            const now = Date.now();
            for (const item of entries) {
                if (!item.id || !uuidRegex.test(item.id)) {
                    throw {
                        msg: `Invalid entry UUID format: ${item.id}`,
                        code: VAULT_ERROR_CODE.INVALID_UUID,
                        status: 400
                    };
                }

                if (!item.cipher || item.cipher.length > VAULT_CONFIG.MAX_CIPHER_LENGTH) {
                    throw {
                        msg: `Cipher text exceeds maximum size ${VAULT_CONFIG.MAX_CIPHER_LENGTH} bytes for entry ${item.id}`,
                        code: VAULT_ERROR_CODE.PAYLOAD_TOO_LARGE,
                        status: 400
                    };
                }

                const clientVersion = Number(item.client_version || item.clientVersion || 1);
                const keyId = item.key_id || item.keyId || meta?.keyId || '';

                // 1. 写入快照表
                await vaultEntryRep.upsertEntry({
                    id: item.id,
                    uid,
                    epoch,
                    cipher: item.cipher,
                    clientVersion,
                    keyId,
                    isDeleted: 0
                }, tx);

                // 2. 级联追加增量流水
                await syncChangelogRep.insertChangelog({
                    uid,
                    deviceId,
                    entityType: SYNC_ENTITY_TYPE.VAULT,
                    scopeType: 'user',
                    scopeId: String(uid),
                    name: item.id,
                    value: item.cipher,
                    isDeleted: 0,
                    clientTimestamp: now
                }, tx);
            }

            // 刷新设备活跃时间
            await syncDeviceRep.updateActiveTime(uid, deviceId, null, tx);

            // 记录导入审计
            await vaultAuditRep.insertAudit({
                uid,
                epoch,
                action: 'ENTRIES_IMPORT',
                deviceId,
                detail: JSON.stringify({
                    count: entries.length,
                    idempotency_key: payload.idempotency_key || payload.idempotencyKey || null
                })
            }, tx);

            return { ok: true, imported: entries.length };
        }, null, dbName);
    }
};
