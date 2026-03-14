import { checkBodyKeysNotBlank } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { MEDIA_ALLOW_CIDR as allowCIDR } from "../../constraints/mediaConst.js"
import { updateAria2TaskStatus } from "../../handler/media/mediaAria2Handler.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.video"

export default {
    basePath: "/media",
    "/aria2/complete": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['gid', 'status']),
        callback: req => updateAria2TaskStatus(req.body['gid'], req.body['status'])
    }
}