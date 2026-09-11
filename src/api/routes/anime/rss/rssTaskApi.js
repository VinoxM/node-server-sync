import { allowLanHosts } from "#constants/allowHostsConst.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank } from "#utils/preCheckUtil.js";
import {
    completeTask, deleteTask,
    pauseTask, queryTasks, queryTaskTorrentInfo,
    resumeTask, updateTaskStatus, addRssTaskFromWebhook
} from "#modules/anime/service/rss/rssTaskService.js";
import { NEED_AUTH_CLIENT } from "#common/constants/authorizationConst.js";

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.anime.rssTask";

export default {
    basePath: "/anime/rss/task",
    "/addTask": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.ANIME,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['rssSubsId', 'rssResultId']),
        callback: req => addRssTaskFromWebhook(req.body.rssSubsId, req.body.rssResultId)
    },
    "/updateTaskStatus": {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uuid', 'status']),
        callback: req => updateTaskStatus(req.body.uuid, req.body.status)
    },
    "/taskInfo": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotEmptyArray(req, 'taskIds'),
        callback: req => queryTaskTorrentInfo(req.body.taskIds)
    },
    "/getTasks": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => queryTasks(req.body.rssSubsId)
    },
    "/deleteTask": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => deleteTask(req.body.taskId)
    },
    "/pauseTask": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => pauseTask(req.body.taskId)
    },
    "/resumeTask": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => resumeTask(req.body.taskId)
    },
    "/completeTask": {
        method: POST,
        needAuth: NEED_AUTH_CLIENT.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => completeTask(req.body.taskId)
    }
}