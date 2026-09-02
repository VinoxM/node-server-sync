import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import { getRequestRealIp } from '#utils/requestUtil.js';
import { pushNotification } from '../../sockets/notification.js';
import { pushRssSubscription } from '../../sockets/rssSubscription.js';

const { POST } = apiMethodConst;

/** 获取通知调试模块通信秘钥 */
const needSecret = () => 'mAou5820.notification';

/**
 * WebSocket 通知推送测试/触发路由模块 (`/notification/*`)
 */
export default defineRoutes({
    basePath: '/notification',

    /**
     * 手动触发广播一条普通系统通知消息
     * 请求体参数：{ message: string }
     */
    '/pushMessage': {
        disabled: true,
        method: POST,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['message']),
        callback: (/** @type {ApiRequest} */ req) => {
            const realIp = getRequestRealIp(req);
            return pushNotification(req.body.message, realIp);
        }
    },

    /**
     * 手动触发推送一条 RSS 订阅更新通知
     * 请求体参数：{ message: any }
     */
    '/pushRssSubscription': {
        disabled: true,
        method: POST,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['message']),
        callback: (/** @type {ApiRequest} */ req) => {
            const realIp = getRequestRealIp(req);
            return pushRssSubscription(JSON.stringify(req.body.message), realIp);
        }
    }
});