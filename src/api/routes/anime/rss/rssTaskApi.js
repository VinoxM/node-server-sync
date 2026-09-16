import { allowLanHosts } from "#constants/allowHostsConst.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank } from "#utils/preCheckUtil.js";
import {
    completeTask, deleteTask,
    pauseTask, queryTasks, queryTaskTorrentInfo,
    resumeTask, updateTaskStatus, addRssTaskFromWebhook
} from "#modules/anime/service/rss/rssTaskService.js";
import { NEED_AUTH_CLIENT } from "#common/constants/authorizationConst.js";
import { defineRoutes } from "#common/utils/defineUtil.js";

const { POST } = apiMethodConst;
const needSecret = () => "mAou5820.anime.rssTask";

/**
 * RSS 种子下载任务与 qBittorrent 调度管理路由模块 (`/anime/rss/task/*`)
 */
export default defineRoutes({
    basePath: "/anime/rss/task",

    /**
     * 响应 Webhook 或手动添加一条 RSS 种子下载任务到 qBittorrent
     * 请求体参数：{ rssSubsId: number, rssResultId: number }
     */
    "/addTask": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.ANIME,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['rssSubsId', 'rssResultId']),
        callback: req => addRssTaskFromWebhook(req.body.rssSubsId, req.body.rssResultId)
    },

    /**
     * 接收下载器完成等状态流转回调并触发剧集解析/任务完成流程
     * 请求体参数：{ uuid: string, status: string }
     */
    "/updateTaskStatus": {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uuid', 'status']),
        callback: req => updateTaskStatus(req.body.uuid, req.body.status)
    },

    /**
     * 批量查询种子在 qBittorrent 中的下载进度与实时状态
     * 请求体参数：{ taskIds: number[] }
     */
    "/taskInfo": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotEmptyArray(req, 'taskIds'),
        callback: req => queryTaskTorrentInfo(req.body.taskIds)
    },

    /**
     * 查询指定订阅关联的全部任务列表
     * 请求体参数：{ rssSubsId: number }
     */
    "/getTasks": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => queryTasks(req.body.rssSubsId)
    },

    /**
     * 删除种子任务（清理 qBittorrent 任务及标签并删除记录）
     * 请求体参数：{ taskId: number }
     */
    "/deleteTask": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => deleteTask(req.body.taskId)
    },

    /**
     * 暂停指定的下载任务
     * 请求体参数：{ taskId: number }
     */
    "/pauseTask": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => pauseTask(req.body.taskId)
    },

    /**
     * 恢复指定的下载任务
     * 请求体参数：{ taskId: number }
     */
    "/resumeTask": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => resumeTask(req.body.taskId)
    },

    /**
     * 手动将部分完成的任务标记为全部完成并清理种子
     * 请求体参数：{ taskId: number }
     */
    "/completeTask": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => completeTask(req.body.taskId)
    }
});