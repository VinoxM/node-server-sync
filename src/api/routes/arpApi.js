import { defineRoutes } from '#utils/defineUtil.js';
import { allowLanCIDR as allowCIDR } from "#constants/allowHostsConst.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { needAuthSingleClient } from '#constants/authorizationConst.js';
import { checkBodyKeyNotBlank } from '#utils/preCheckUtil.js';
import { getWakeableServers, reloadServers, shutdownOnLan, wakeOnLan } from '#modules/arp/arpScanService.js';

const { POST, GET } = apiMethodConst;

/** 获取 ARP 主机管理模块通信秘钥 */
const needSecret = () => "mAou5820.arp";
const needAuth = needAuthSingleClient.MANAGE;

/**
 * 局域网 ARP 设备状态监控与电源管理路由模块 (`/arp/*`)
 */
export default defineRoutes({
    basePath: "/arp",

    /**
     * 获取可唤醒的主机服务器列表及状态
     */
    "/getWakeableServers": {
        method: GET,
        allowCIDR,
        needAuth,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        needSecret,
        callback: () => getWakeableServers()
    },

    /**
     * 热重载 ARP 服务的目标服务器配置 (targets.yaml)
     */
    "/reloadServers": {
        method: POST,
        allowCIDR,
        needAuth,
        needSecret,
        callback: () => reloadServers()
    },

    /**
     * 唤醒主机服务器
     * 请求体参数：{ server: string }
     */
    "/wakeOnLan": {
        method: POST,
        allowCIDR,
        needAuth,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'server'),
        callback: (/** @type {ApiRequest} */ req) => wakeOnLan(req.body.server)
    },

    /**
     * 关闭主机服务器
     * 请求体参数：{ server: string }
     */
    "/shutdownOnLan": {
        method: POST,
        allowCIDR,
        needAuth,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'server'),
        callback: (/** @type {ApiRequest} */ req) => shutdownOnLan(req.body.server)
    }
});
