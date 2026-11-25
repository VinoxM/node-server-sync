import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from "#constants/apiMethodConst.js";
import { checkBodyKeysNotBlank } from "#utils/preCheckUtil.js";
import * as qbitService from '#modules/download/qbitorrentService.js';
import { allowLanCIDR as allowCIDR } from '#constants/allowHostsConst.js';

const { POST } = apiMethodConst;

/** 获取下载管理模块通信秘钥 */
const needSecret = () => "mAou5820.download";

/**
 * qBittorrent 下载管理路由模块 (`/download/*`)
 */
export default defineRoutes({
    basePath: "/download",

    /**
     * 添加种子/磁力链接下载任务
     * 请求体参数：{ torrent: string }
     */
    "/qbit/addTorrent": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['torrent']),
        callback: (/** @type {ApiRequest} */ req) => {
            return qbitService.addTorrent(req.body.torrent);
        }
    },

    /**
     * 查询单个种子任务详情
     * 请求体参数：{ uuid?: string, hash?: string }
     */
    "/qbit/torrentInfo": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: (/** @type {ApiRequest} */ req) => {
            try {
                checkBodyKeysNotBlank(req, ['uuid']);
            } catch (ignored) {
                checkBodyKeysNotBlank(req, ['hash']);
            }
        },
        callback: (/** @type {ApiRequest} */ req) => {
            return qbitService.torrentInfo(req.body.uuid, req.body.hash);
        }
    },

    /**
     * 获取种子内部文件明细与下载进度
     * 请求体参数：{ hash: string }
     */
    "/qbit/torrentFiles": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['hash']),
        callback: (/** @type {ApiRequest} */ req) => {
            return qbitService.torrentFiles(req.body.hash);
        }
    },

    /**
     * 删除指定的种子任务（同时清理本地文件）
     * 请求体参数：{ hash: string }
     */
    "/qbit/delTorrent": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['hash']),
        callback: (/** @type {ApiRequest} */ req) => {
            return qbitService.deleteTorrent(req.body.hash, true);
        }
    }
});