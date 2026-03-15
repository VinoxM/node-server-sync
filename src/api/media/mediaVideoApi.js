import { checkBodyKeyNotBlank, checkBodyKeysNotBlank, checkBodyKeysNotNull } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { addCategory, addVideo, checkVideoCanAdd, removeVideo } from "../../handler/media/mediaVideoHandler.js"
import { MEDIA_ALLOW_CIDR as allowCIDR } from "../../constraints/mediaConst.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.video"

export default {
    basePath: "/media",
    "/category/addOne": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeyNotBlank(req, 'category'),
        callback: req => addCategory(req.body['category'])
    },
    "/video/checkCanAdd": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'author', 'uniqueId']),
        callback: req => checkVideoCanAdd(req.body)
    },
    "/video/addOne": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotNull(req, ['title', 'author', 'category', 'uploadTime']),
        callback: req => addVideo(req.body)
    },
    "/video/editOne": {
        disabled: true,
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: req => removeVideo(req.body['videoId'])
    },
    "/video/delOne": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: req => removeVideo(req.body['videoId'])
    }
}