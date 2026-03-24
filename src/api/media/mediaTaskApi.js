import { checkBodyKeysNotBlank } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { MEDIA_ALLOW_CIDR as allowCIDR, MEDIA_ALLOW_HOSTS as allowHosts, MEDIA_ARIA2_TASK_STATUS } from "../../constraints/mediaConst.js"
import { pauseOrResumeTask, updateTaskStatus } from "../../handler/media/mediaTaskHandler.js"
import { updateMinioStatus } from "../../handler/media/mediaMinioHandler.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.task"

export default {
    basePath: "/media/task",
    "/onDownloadStart": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['gid']),
        callback: req => updateTaskStatus(req.body['gid'], MEDIA_ARIA2_TASK_STATUS.DOWNLOADING)
    },
    "/onDownloadComplete": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['gid', 'status']),
        callback: req => updateTaskStatus(req.body['gid'], req.body['status'])
    },
    "/updateStorageStatus": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'status']),
        callback: req => updateMinioStatus(req.body['id'], req.body['status'])
    },
    "/toggleAria2Task": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['gid', 'operator']),
        callback: req => pauseOrResumeTask(req.body['gid'], req.body['operator'])
    }
}