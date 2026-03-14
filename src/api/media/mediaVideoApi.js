import { checkBodyKeyNotBlank, checkBodyKeysNotNull } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { addCategory, addVideo, removeVideo } from "../../handler/media/mediaVideoHandler.js"
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
    "/video/addOne": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotNull(req, ['title', 'author', 'category', 'uploadTime']),
        callback: req => addVideo(req.body)
    },
    "/video/editOne": {
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