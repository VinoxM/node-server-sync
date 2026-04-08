import { MEDIA_ALLOW_HOSTS as allowHosts } from "../../../modules/media/constants/mediaConst.js"
import apiMethodConst from "../../../common/constants/apiMethodConst.js"
import { checkBodyKeysNotBlank } from "../../../common/utils/preCheckUtil.js"
import { saveWebhookEvent } from "../../../modules/media/service/mediaBiliveRecordService.js"
import { getStreamEndedRecordEventData, searchStream } from "../../../modules/media/service/bilive/biliveStreamService.js"
import { getFilesByStreamId, uploadFileToMedia } from "../../../modules/media/service/bilive/biliveFileService.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.bilive-record"

export default {
    basePath: "/media/bilive",
    /** Bilive Record */
    "/record/webhook": {
        method: POST,
        ignoreSecret: true,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['EventType', 'EventId', 'EventTimestamp']),
        callback: req => saveWebhookEvent(req.body)
    },
    "/record/searchStream": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['pageSize', 'pageNum']),
        callback: req => searchStream(req.body['roomId'], req.body['hostName'], req.body['pageSize'], req.body['pageNum'])
    },
    "/record/getStreamEndedEventData": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['streamId']),
        callback: req => getStreamEndedRecordEventData(req.body['streamId'])
    },
    "/record/getStreamFiles": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['streamId']),
        callback: req => getFilesByStreamId(req.body['streamId'])
    },
    "/record/getRecordPath": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        callback: () => __env.get('bilive.record.savePath', '/mnt/storage/bilive/recording')
    },
    "/record/uploadFileToMedia": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['fileId']),
        callback: req => uploadFileToMedia(req.body['fileId'])
    }
}