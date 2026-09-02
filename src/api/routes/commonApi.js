import { defineRoutes } from '#utils/defineUtil.js';
import { allowLanHosts } from "#constants/allowHostsConst.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { getRequestRealIp } from "#utils/requestUtil.js";
import { ipBlocker } from "#core/instance/ipBlocker.js";
import { tokenBucket } from "#core/instance/tokenBucket.js";
import { reloadApplicationContext } from "../../support.js";

const { POST, GET } = apiMethodConst;

/** 获取通用系统控制模块通信秘钥 */
const needSecret = () => "mAou5820.common";

/**
 * 系统通用管理与状态运维路由模块 (`/common/*`)
 */
export default defineRoutes({
    basePath: "/common",

    /**
     * 热重载应用程序配置上下文
     */
    "/reloadApplicationConfig": {
        method: POST,
        needSecret,
        callback: () => {
            return reloadApplicationContext();
        }
    },

    /**
     * 重置并重新启动令牌桶限流器 (TokenBucket)
     */
    "/resetTokenBucket": {
        method: POST,
        needSecret,
        callback: () => {
            return tokenBucket.start();
        }
    },

    /**
     * 重置并重新启动 IP 封禁器 (IpBlocker)
     */
    "/resetIpBlocker": {
        method: POST,
        needSecret,
        callback: () => {
            return ipBlocker.start();
        }
    },

    /**
     * 清理所有被封禁的 IP 记录
     */
    "/cleanIpBlocker": {
        method: POST,
        needSecret,
        callback: () => {
            return ipBlocker.clean();
        }
    },

    /**
     * 手动解封当前请求来源 IP
     */
    "/unblockIp": {
        method: POST,
        needSecret: () => "common.unblocked",
        callback: (/** @type {ApiRequest} */ req) => {
            const realIp = getRequestRealIp(req);
            return ipBlocker.unblock(realIp);
        }
    },

    /**
     * 获取当前系统已配置并支持的 SSH 执行器节点标签列表
     */
    "/getSupportedSshExecutors": {
        method: GET,
        allowHosts: allowLanHosts,
        needSecret,
        callback: () => {
            const opts = __env.get('ssh', {});
            return Array.from(Object.keys(opts));
        }
    },

    /**
     * 探活/空操作心跳检查接口
     */
    "/doNothing": {
        method: GET,
        allowHosts: allowLanHosts,
        needSecret: () => 'mAou5820.doNothing',
        callback: () => "Ok"
    }
});