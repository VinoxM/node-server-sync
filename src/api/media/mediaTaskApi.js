import { checkBodyKeysNotBlank } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { MEDIA_ALLOW_CIDR as allowCIDR, MEDIA_ARIA2_TASK_STATUS } from "../../constraints/mediaConst.js"
import { updateAria2TaskStatus } from "../../handler/media/mediaAria2Handler.js"
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
        callback: req => updateAria2TaskStatus(req.body['gid'], MEDIA_ARIA2_TASK_STATUS.DOWNLOADING)
    },
    "/onDownloadComplete": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['gid', 'status']),
        callback: req => updateAria2TaskStatus(req.body['gid'], req.body['status'])
    },
    "/updateStorageStatus": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'status']),
        callback: req => updateMinioStatus(req.body['id'], req.body['status'])
    }
}