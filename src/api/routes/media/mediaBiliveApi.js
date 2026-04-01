import apiMethodConst from "../../../common/constants/apiMethodConst.js"
import { checkBodyKeysNotBlank } from "../../../common/utils/preCheckUtil.js"
import { saveWebhookEvent } from "../../../modules/media/service/mediaBiliveRecordService.js"

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
}