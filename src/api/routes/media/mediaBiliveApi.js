import { MEDIA_ALLOW_HOSTS as allowHosts } from "../../../modules/media/constants/mediaConst.js"
import apiMethodConst from "../../../common/constants/apiMethodConst.js"
import { checkBodyKeysNotBlank } from "../../../common/utils/preCheckUtil.js"
import { getEventSessions, saveWebhookEvent, uploadRecord } from "../../../modules/media/service/mediaBiliveRecordService.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.bilive-record"

export default {
    basePath: "/media/bilive",
    /** Bilive Record */
    "/record/webhook": {
        method: POST,
        ignoreSecret: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['EventType', 'EventId', 'EventTimestamp']),
        callback: req => saveWebhookEvent(req.body)
    },
    "/record/sessionList": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['currentPage', 'pageSize']),
        callback: req => getEventSessions(req.body['currentPage'], req.body['pageSize'])
    },
    "/record/getRecordPath": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        callback: () => __env.get('bilive.record.savePath', '/mnt/storage/bilive/recording')
    },
    "/record/uploadRecordToMedia": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['filePath', 'hostName', 'title']),
        callback: req => uploadRecord(req.body)
    }
}