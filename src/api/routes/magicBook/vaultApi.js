import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import vaultService from '#modules/magicBook/service/vaultService.js';

const { GET, POST, PUT } = apiMethodConst;
const needAuth = needAuthSingleClient.MAGIC_BOOK;
const needSecret = () => 'mAou5820.magic-book';

const extractDeviceId = (req) => {
    return req.body?.device_id || req.body?.deviceId || req.headers?.['x-device-id'] || 'unknown';
};

/**
 * 密码金库专属管理路由模块 (`/magic-book/vault/*`)
 */
export default defineRoutes({
    basePath: '/magic-book/vault',

    /**
     * 自愈状态机探测入口
     * 请求体参数：{}
     */
    '/status': {
        method: POST,
        needAuth,
        needSecret,
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            return vaultService.getVaultStatus(uid);
        }
    },

    /**
     * 云端完整信封只读下发 (新设备登录、本地金库丢失自愈或恢复密钥解锁时拉取)
     */
    '/envelope': {
        method: GET,
        needAuth,
        needSecret,
        ignoreReturnPrint: true,
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            return vaultService.getVaultEnvelope(uid);
        }
    },

    /**
     * 基于 CAS 乐观锁保存或更新信封数据
     * 请求体参数：{ epoch, expected_version, key_id, kdf_alg, kdf_iterations, kdf_salt, wrapped_dek, recovery_wrapped_dek?, recovery_salt?, recovery_iterations?, content_hash? }
     */
    '/envelope/update': {
        method: PUT,
        path: '/envelope',
        needAuth,
        needSecret,
        ignoreReturnPrint: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['key_id', 'wrapped_dek']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            const deviceId = extractDeviceId(req);
            return vaultService.saveOrUpdateEnvelope(uid, deviceId, req.body);
        }
    },

    /**
     * 金库改密轮转 (原子更新主密码信封与恢复信封)
     * 请求体参数：{ epoch, old_key_id, new_wrapped_dek, new_key_id, new_salt, new_iterations, new_recovery_wrapped_dek?, new_recovery_salt?, new_recovery_iterations? }
     */
    '/envelope/rotate': {
        method: POST,
        needAuth,
        needSecret,
        ignoreReturnPrint: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['old_key_id', 'new_key_id', 'new_wrapped_dek']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            const deviceId = extractDeviceId(req);
            return vaultService.rotateEnvelope(uid, deviceId, req.body);
        }
    },

    /**
     * 重置金库 (防重置炸弹核心：单事务内 epoch+1、软删所有旧条目、清空旧信封，物理清除旧 vault changelog)
     * 请求体参数：{ epoch, confirm: 'RESET' }
     */
    '/reset': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['confirm']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            const deviceId = extractDeviceId(req);
            return vaultService.resetVault(uid, deviceId, req.body);
        }
    },

    /**
     * Keyset 游标分页拉取活跃凭据快照 (单页上限 200 条，杜绝 OFFSET 漂移与爆内存)
     * 请求体参数：{ epoch?: number, limit?: number, page_token?: string }
     */
    '/snapshot': {
        method: POST,
        needAuth,
        needSecret,
        ignoreReturnPrint: true,
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            return vaultService.getSnapshot(uid, req.body);
        }
    },

    /**
     * 访客迁移导入 (单批 ≤ 200 条，幂等防重，同一事务内批量写 entries 并级联写 changelog)
     * 请求体参数：{ device_id: string, idempotency_key?: string, epoch: number, entries: Array<object> }
     */
    '/import': {
        method: POST,
        needAuth,
        needSecret,
        ignoreReturnPrint: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['device_id']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            const deviceId = req.body.device_id || req.body.deviceId;
            return vaultService.importEntries(uid, deviceId, req.body);
        }
    }
});
