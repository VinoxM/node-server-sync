import { defineRoutes } from '#utils/defineUtil.js';
import { allowLanHosts } from "#constants/allowHostsConst.js";
import { checkQueryKeyValue } from "#utils/preCheckUtil.js";
import { storeSSE } from "#modules/socket/sseStorage.js";
import apiMethodConst from '#constants/apiMethodConst.js';

const { GET } = apiMethodConst;

/**
 * Server-Sent Events (SSE) 长连接建立路由模块
 */
export default defineRoutes({
    /**
     * SSE 客户端连接接入端点 (`/events?channel=...&secret=...`)
     */
    '/events': {
        method: GET,
        allowHosts: allowLanHosts,
        ignoreTrace: true,
        ignoreSecret: true,
        maybeStream: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkQueryKeyValue(req, 'secret', 'mAou5820.sseEvents', { errorStatus: 400 }),
        ignoreReturn: true,
        callback: (/** @type {ApiRequest} */ req, /** @type {ApiResponse} */ res) => storeSSE(req, res)
    }
});