import { checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank, checkBodyKeysNotNull } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { addVideo, delVideo } from "../../handler/media/mediaHandler.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.video"

const allowCIDR = [
    '192.168.31.0/24',
    '172.17.0.0/24',
    '127.0.0.1'
]

export default {
    basePath: "/media",
    "/video/addOne": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => {
            checkBodyKeysExists(req, ['uniqueId'])
            checkBodyKeysNotNull(req, ['title', 'author', 'category', 'uploadTime', 'tags'])
            checkBodyKeysNotBlank(req, ['uri'])
        },
        callback: req => addVideo(req.body)
    },
    "/video/delOne": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: req => delVideo(req.body['videoId'])
    }
}