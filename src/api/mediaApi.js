import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank, checkBodyKeysNotNull } from "../common/apiPreCheck.js"
import apiMethodConst from "../constraints/apiMethodConst.js"
import { updateAria2TaskStatus } from "../handler/media/mediaAria2Handler.js"
import { checkVideoFilterRules, handleFilterRule } from "../handler/media/mediaFilterHandler.js"
import { updateMinioStatus } from "../handler/media/mediaMinioHandler.js"
import { addCategory, addVideo, removeVideo } from "../handler/media/mediaVideoHandler.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.video"

const allowCIDR = [
    '192.168.31.0/24',
    '172.17.0.0/24',
    '127.0.0.1'
]

const allowHosts = ['server.vinoxm.name', '28000--main--code-server--maou864--coder.vinoxm.cloud']

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
    "/video/delOne": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: req => removeVideo(req.body['videoId'])
    },
    "/aria2/complete": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['gid', 'status']),
        callback: req => updateAria2TaskStatus(req.body['gid'], req.body['status'])
    },
    "/video/updateMinioStatus": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'status']),
        callback: req => updateMinioStatus(req.body['id'], req.body['status'])
    },
    "/filterRules/add": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'type', 'value', 'oparetor']),
        callback: req => handleFilterRule(req.body)
    },
    "/filterRules/remove": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'type', 'value', 'oparetor']),
        callback: req => handleFilterRule(req.body, false)
    },
    "/filterRules/validate": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['category']) && checkBodyKeyNotEmptyArray(req, 'rules'),
        callback: req => checkVideoFilterRules(req.body)
    }
}