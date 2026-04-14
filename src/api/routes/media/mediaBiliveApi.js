import { MEDIA_ALLOW_HOSTS as allowHosts } from "../../../modules/media/constants/mediaConst.js"
import apiMethodConst from "../../../common/constants/apiMethodConst.js"
import { checkBodyKeysNotBlank } from "../../../common/utils/preCheckUtil.js"
import { saveWebhookEvent } from "../../../modules/media/service/mediaBiliveRecordService.js"
import { deleteStream, getBiliveRecordTags, getStreamEndedRecordEventData, initStreamVideo, searchStream } from "../../../modules/media/service/bilive/biliveStreamService.js"
import { deleteFile, getFilesByStreamId, removeFileByFileId, uploadFileToMediaByFileId } from "../../../modules/media/service/bilive/biliveFileService.js"
import { biliveRecordApi } from "../../../modules/media/service/bilive/biliveApiService.js"

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
    "/record/api/room": {
        method: POST,
        needSecret,
        allowHosts,
        callback: () => biliveRecordApi.getAllRooms()
    },
    "/record/api/file": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['filePath']),
        callback: req => biliveRecordApi.getFilesInfo(req.body['filePath'])
    },
    /** Media Bilive Manager */
    "/record/searchStream": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['pageSize', 'pageNum']),
        callback: req => searchStream(req.body['roomId'], req.body['hostName'], req.body['pageSize'], req.body['pageNum'])
    },
    "/record/getStreamEndedEventData": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['streamId']),
        callback: req => getStreamEndedRecordEventData(req.body['streamId'])
    },
    "/record/getBiliveRecordTags": {
        method: POST,
        needSecret,
        allowHosts,
        callback: () => getBiliveRecordTags()
    },
    "/record/initStreamVideo": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['streamId']),
        callback: req => initStreamVideo(req.body['streamId'], req.body['tags'])
    },
    "/record/deleteStream": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['streamId']),
        callback: req => deleteStream(req.body['streamId'])
    },
    "/record/getStreamFiles": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['streamId']),
        callback: req => getFilesByStreamId(req.body['streamId'])
    },
    "/record/uploadFileToMedia": {
        method: POST,
        needSecret,
        allowHosts,
        maybeStream: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['fileId']),
        callback: req => uploadFileToMediaByFileId(req.body['fileId'])
    },
    "/record/deletePhysicFile": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['fileId']),
        callback: req => removeFileByFileId(req.body['fileId'])
    },
    "/record/deleteFile": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['fileId']),
        callback: req => deleteFile(req.body['fileId'])
    },
}