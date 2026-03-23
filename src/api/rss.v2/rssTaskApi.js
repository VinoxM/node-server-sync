import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank } from '../../common/apiPreCheck.js';
import apiMethodConst from '../../constraints/apiMethodConst.js';
import { addRssTask, completeTask, deleteTask, pauseTask, queryTasks, queryTaskTorrentInfo, resumeTask, updateTaskStatus } from '../../handler/rss/rssTaskHandler.js';
import rssResultRep from '../../repository/rss/rssResultRep.js';
import { concatTracker } from '../../handler/rss/rssTrackerHandler.js';

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.rssTask";

export default {
    basePath: "/rss/task",
    "/addTask": {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['rssSubsId', 'rssResultId']),
        callback: async (req) => {
            const rssSubsId = req.body.rssSubsId
            const rssResultId = req.body.rssResultId
            const rssResult = await rssResultRep.selectOneForTaskByIdAndPid(rssResultId, rssSubsId)
            if (!rssResult) {
                throwMessage('Invalid rss result.')
            }
            const torrent = await concatTracker(rssResult.torrent, rssResult.tracker)
            return addRssTask({
                torrent,
                title: rssResult.title,
                rssSubsId: rssResult.pid,
                resultId: rssResult.id
            }).then(taskInfo => taskInfo ? taskInfo : throwMessage('Add task failed.'))
        }
    },
    "/updateTaskStatus": {
        method: POST,
        allowHosts: ['server.vinoxm.name', '28000--main--code-server--maou864--coder.vinoxm.cloud'],
        needSecret,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['uuid', 'status']),
        callback: req => updateTaskStatus(req.body.uuid, req.body.status)
    },
    "/taskInfo": {
        method: POST,
        needAuth: true,
        ignoreOutput: true,
        needSecret,
        preCheck: req => checkBodyKeyNotEmptyArray(req, 'taskIds'),
        callback: req => queryTaskTorrentInfo(req.body.taskIds)
    },
    "/getTasks": {
        method: POST,
        needAuth: true,
        ignoreOutput: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => queryTasks(req.body.rssSubsId)
    },
    "/deleteTask": {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => deleteTask(req.body.taskId)
    },
    "/pauseTask": {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => pauseTask(req.body.taskId)
    },
    "/resumeTask": {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => resumeTask(req.body.taskId)
    },
    "/completeTask": {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => completeTask(req.body.taskId)
    }
}