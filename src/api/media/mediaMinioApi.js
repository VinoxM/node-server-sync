import { checkBodyKeysNotBlank } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { updateMinioStatus } from "../../handler/media/mediaMinioHandler.js"
import { MEDIA_ALLOW_CIDR as allowCIDR } from "../../constraints/mediaConst.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.video"

export default {
    basePath: "/media",
    "/video/updateMinioStatus": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'status']),
        callback: req => updateMinioStatus(req.body['id'], req.body['status'])
    }
}