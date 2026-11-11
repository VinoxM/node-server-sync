import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import { getBaselineSnapshot, pullChanges, pushChanges } from '#modules/magicBook/service/syncService.js';

const { POST } = apiMethodConst;
const needAuth = needAuthSingleClient.MAGIC_BOOK;
const needSecret = () => 'mAou5820.magic-book';

/**
 * 增量同步核心引擎路由模块 (`/magic-book/sync/*`)
 */
export default defineRoutes({
    basePath: '/magic-book/sync',

    /**
     * 增量变更拉取
     * 请求体参数：{ cursor?: number, limit?: number }
     */
    '/pull': {
        method: POST,
        needAuth,
        needSecret,
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            const { cursor, limit } = req.body;
            return pullChanges(uid, cursor, limit);
        }
    },

    /**
     * 增量变更提交 (支持泛型 scope_type, scope_id 与旧版 scope, profile_id)
     * 请求体参数：{ device_id: string, changes: Array<object> }
     */
    '/push': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['device_id']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            const { device_id, changes } = req.body;
            return pushChanges(uid, device_id, changes);
        }
    },

    /**
     * 获取基准全量快照 (支持泛型作用域或指定档案过滤)
     * 请求体参数：{ profile_id?: string, scope_type?: string, scope_id?: string }
     */
    '/snapshot': {
        method: POST,
        needAuth,
        needSecret,
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            const { profile_id, scope_type, scope_id } = req.body;
            return getBaselineSnapshot(uid, { profileId: profile_id, scopeType: scope_type, scopeId: scope_id });
        }
    }
});
