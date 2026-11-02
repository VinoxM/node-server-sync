import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import { createProfile, deleteProfile, listProfiles, renameProfile } from '#modules/magicBook/service/syncProfileService.js';

const { POST } = apiMethodConst;
const needAuth = needAuthSingleClient.MAGIC_BOOK;
const needSecret = () => 'mAou5820.magic-book';

/**
 * 档案管理路由模块 (`/magic-book/profile/*`)
 */
export default defineRoutes({
    basePath: '/magic-book/profile',

    /**
     * 获取当前用户的档案元数据列表
     * 请求体参数：{}
     */
    '/list': {
        method: POST,
        needAuth,
        needSecret,
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            return listProfiles(uid);
        }
    },

    /**
     * 创建新档案
     * 请求体参数：{ profile_id: string, label: string, is_default?: boolean }
     */
    '/create': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['profile_id', 'label']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            return createProfile(uid, req.body);
        }
    },

    /**
     * 重命名档案
     * 请求体参数：{ profile_id: string, label: string }
     */
    '/rename': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['profile_id', 'label']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            return renameProfile(uid, req.body);
        }
    },

    /**
     * 删除档案（软删除）
     * 请求体参数：{ profile_id: string }
     */
    '/delete': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['profile_id']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            return deleteProfile(uid, req.body);
        }
    }
});
