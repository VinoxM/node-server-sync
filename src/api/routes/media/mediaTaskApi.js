import { defineRoutes } from '#utils/defineUtil.js';
import { allowLanCIDR, allowLanHosts } from "#constants/allowHostsConst.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { checkBodyKeysNotBlank } from "#utils/preCheckUtil.js";
import { MEDIA_ARIA2_TASK_STATUS } from "#modules/media/constants/mediaConst.js";
import { updateMinioStatus } from "#modules/media/service/mediaMinioService.js";
import { pauseOrResumeTask, updateTaskStatus } from "#modules/media/service/mediaTaskService.js";

const { POST } = apiMethodConst;

/** 获取媒体任务调度模块通信秘钥 */
const needSecret = () => "mAou5820.media.task";

/**
 * 媒体后台下载任务与存储状态机回调路由模块 (`/media/task/*`)
 */
export default defineRoutes({
    basePath: "/media/task",

    /**
     * Aria2 任务开始下载回调端点
     * 请求体参数：{ gid: string }
     */
    "/onDownloadStart": {
        method: POST,
        needSecret,
        allowCIDR: allowLanCIDR,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['gid']),
        callback: (/** @type {ApiRequest} */ req) => updateTaskStatus(req.body['gid'], MEDIA_ARIA2_TASK_STATUS.DOWNLOADING)
    },

    /**
     * Aria2 任务下载完成/失败状态流转回调端点
     * 请求体参数：{ gid: string, status: number }
     */
    "/onDownloadComplete": {
        method: POST,
        needSecret,
        allowCIDR: allowLanCIDR,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['gid', 'status']),
        callback: (/** @type {ApiRequest} */ req) => updateTaskStatus(req.body['gid'], req.body['status'])
    },

    /**
     * 手动更新 MinIO 对象存储任务状态
     * 请求体参数：{ id: number, status: number }
     */
    "/updateStorageStatus": {
        method: POST,
        needSecret,
        allowCIDR: allowLanCIDR,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['id', 'status']),
        callback: (/** @type {ApiRequest} */ req) => updateMinioStatus(req.body['id'], req.body['status'])
    },

    /**
     * 暂停或恢复指定的 Aria2 任务
     * 请求体参数：{ gid: string, operator: 'pause'|'resume' }
     */
    "/toggleAria2Task": {
        method: POST,
        needSecret,
        needAuth: true,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['gid', 'operator']),
        callback: (/** @type {ApiRequest} */ req) => pauseOrResumeTask(req.body['gid'], req.body['operator'])
    }
});