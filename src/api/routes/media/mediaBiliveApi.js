import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import { saveWebhookEvent } from '#modules/media/service/mediaBiliveRecordService.js';
import {
    closeReadyToEndStream, deleteStream, getBiliveRecordTags,
    getStreamEndedRecordEventData, initStreamVideo, searchStream,
    stopAutoSync, syncStreamToMediaStorage
} from '#modules/media/service/bilive/biliveStreamService.js';
import { deleteFile, getFilesByStreamId, removeFileByFileId, uploadFileToMediaByFileId } from '#modules/media/service/bilive/biliveFileService.js';
import { biliveRecordApi } from '#modules/media/service/bilive/biliveApiService.js';
import { allowLanHosts } from '#constants/allowHostsConst.js';
import { NEED_AUTH_CLIENT } from '#common/constants/authorizationConst.js';

const { POST } = apiMethodConst;
const needAuth = { clients: [NEED_AUTH_CLIENT.MANAGE] };

/** 获取 B站直播录制模块通信秘钥 */
const needSecret = () => "mAou5820.media.bilive-record";

/**
 * B站直播录制与推流管理路由模块 (`/media/bilive/*`)
 */
export default defineRoutes({
    basePath: "/media/bilive",

    /**
     * 接收录制器 Webhook 事件回调端点
     */
    "/record/webhook": {
        method: POST,
        ignoreSecret: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['EventType', 'EventId', 'EventTimestamp']),
        callback: (/** @type {ApiRequest} */ req) => saveWebhookEvent(req.body)
    },

    /**
     * 查询录制器监控的全部直播间列表 (代理远程 Basic 接口)
     */
    "/record/api/room": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        callback: () => biliveRecordApi.getAllRooms()
    },

    /**
     * 查询录制切片文件信息
     * 请求体参数：{ filePath: string }
     */
    "/record/api/file": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['filePath']),
        callback: (/** @type {ApiRequest} */ req) => biliveRecordApi.getFilesInfo(req.body['filePath'])
    },

    /**
     * 分页检索直播流历史记录
     * 请求体参数：{ roomId?: string|number, hostName?: string, pageSize: number, pageNum: number }
     */
    "/record/searchStream": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['pageSize', 'pageNum']),
        callback: (/** @type {ApiRequest} */ req) => searchStream(req.body['roomId'], req.body['hostName'], req.body['pageSize'], req.body['pageNum'])
    },

    /**
     * 获取关播事件原始详细数据
     * 请求体参数：{ streamId: number }
     */
    "/record/getStreamEndedEventData": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['streamId']),
        callback: (/** @type {ApiRequest} */ req) => getStreamEndedRecordEventData(req.body['streamId'])
    },

    /**
     * 获取录制分类下的常用标签及使用频次
     */
    "/record/getBiliveRecordTags": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        callback: () => getBiliveRecordTags()
    },

    /**
     * 将直播流初始化为一条媒体视频记录
     * 请求体参数：{ streamId: number, tags?: string[] }
     */
    "/record/initStreamVideo": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['streamId']),
        callback: (/** @type {ApiRequest} */ req) => initStreamVideo(req.body['streamId'], req.body['tags'])
    },

    /**
     * 删除指定的直播推流记录
     * 请求体参数：{ streamId: number }
     */
    "/record/deleteStream": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['streamId']),
        callback: (/** @type {ApiRequest} */ req) => deleteStream(req.body['streamId'])
    },

    /**
     * 获取指定直播流下的全部切片文件列表
     * 请求体参数：{ streamId: number }
     */
    "/record/getStreamFiles": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['streamId']),
        callback: (/** @type {ApiRequest} */ req) => getFilesByStreamId(req.body['streamId'])
    },

    /**
     * 将单个切片文件上传同步至媒体对象存储 (MinIO)
     * 请求体参数：{ fileId: number }
     */
    "/record/uploadFileToMedia": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        maybeStream: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['fileId']),
        callback: (/** @type {ApiRequest} */ req) => uploadFileToMediaByFileId(req.body['fileId'])
    },

    /**
     * 移除切片对应的本地物理文件
     * 请求体参数：{ fileId: number }
     */
    "/record/deletePhysicFile": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['fileId']),
        callback: (/** @type {ApiRequest} */ req) => removeFileByFileId(req.body['fileId'], true)
    },

    /**
     * 物理删除已标记为 REMOVED 的切片记录
     * 请求体参数：{ fileId: number }
     */
    "/record/deleteFile": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['fileId']),
        callback: (/** @type {ApiRequest} */ req) => deleteFile(req.body['fileId'], true)
    },

    /**
     * 将准备下播状态的直播流手动置为关播
     * 请求体参数：{ streamId: number }
     */
    "/record/closeReadyToEndStream": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['streamId']),
        callback: (/** @type {ApiRequest} */ req) => closeReadyToEndStream(req.body['streamId'])
    },

    /**
     * 手动触发指定直播流全量切片的自动同步与上传流
     * 请求体参数：{ streamId: number }
     */
    "/record/autoSyncStream": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        maybeStream: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['streamId']),
        callback: (/** @type {ApiRequest} */ req) => syncStreamToMediaStorage(req.body['streamId'])
    },

    /**
     * 手动停止某条直播流的自动同步
     * 请求体参数：{ streamId: number }
     */
    "/record/stopAutoSync": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['streamId']),
        callback: (/** @type {ApiRequest} */ req) => stopAutoSync(req.body['streamId'])
    }
});