import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import { getDeviceList, registerDevice, removeDevice } from '#modules/magicBook/service/syncDeviceService.js';
import { getRequestTokenHash } from '#utils/requestUtil.js';

const { POST } = apiMethodConst;
const needAuth = needAuthSingleClient.MAGIC_BOOK;
const needSecret = () => 'mAou5820.magic-book';

/**
 * 客户端设备管理路由模块 (`/magic-book/device/*`)
 */
export default defineRoutes({
    basePath: '/magic-book/device',

    /**
     * 客户端设备登记或活跃时间更新
     * 请求体参数：{ device_id: string, device_name: string, platform: string }
     */
    '/register': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['device_id', 'device_name', 'platform']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            const tokenHash = getRequestTokenHash(req);
            return registerDevice(uid, req.body, tokenHash);
        }
    },

    /**
     * 获取当前登录用户的登记设备列表
     * 请求体参数：{}
     */
    '/list': {
        method: POST,
        needAuth,
        needSecret,
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            return getDeviceList(uid);
        }
    },

    /**
     * 移除客户端设备授权并即刻销毁会话
     * 请求体参数：{ device_id: string }
     */
    '/remove': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['device_id']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const uid = req.userInfo?.id;
            const { device_id } = req.body;
            return removeDevice(uid, device_id);
        }
    }
});
