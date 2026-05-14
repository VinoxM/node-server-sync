import { allowLanCIDR, allowLanHosts } from "../../../common/constants/allowHostsConst.js"
import apiMethodConst from "../../../common/constants/apiMethodConst.js"
import { checkBodyKeysNotBlank } from "../../../common/utils/preCheckUtil.js"
import { MEDIA_ARIA2_TASK_STATUS } from "../../../modules/media/constants/mediaConst.js"
import { updateMinioStatus } from "../../../modules/media/service/mediaMinioService.js"
import { pauseOrResumeTask, updateTaskStatus } from "../../../modules/media/service/mediaTaskService.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.task"

export default {
    basePath: "/media/task",
    "/onDownloadStart": {
        method: POST,
        needSecret,
        allowCIDR: allowLanCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['gid']),
        callback: req => updateTaskStatus(req.body['gid'], MEDIA_ARIA2_TASK_STATUS.DOWNLOADING)
    },
    "/onDownloadComplete": {
        method: POST,
        needSecret,
        allowCIDR: allowLanCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['gid', 'status']),
        callback: req => updateTaskStatus(req.body['gid'], req.body['status'])
    },
    "/updateStorageStatus": {
        method: POST,
        needSecret,
        allowCIDR: allowLanCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'status']),
        callback: req => updateMinioStatus(req.body['id'], req.body['status'])
    },
    "/toggleAria2Task": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['gid', 'operator']),
        callback: req => pauseOrResumeTask(req.body['gid'], req.body['operator'])
    }
}