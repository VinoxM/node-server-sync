import { checkBodyKeyNotBlank, checkBodyKeysNotBlank, checkBodyKeysNotNull } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { addCategory, createVideo, checkVideoCanAdd, removeVideo } from "../../handler/media/mediaVideoHandler.js"
import { MEDIA_ALLOW_CIDR as allowCIDR } from "../../constraints/mediaConst.js"
import { retryMinio } from "../../handler/media/mediaMinioHandler.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.management"

export default {
    basePath: "/media/manage",
    /** Videos management */
    "/videos/preCheck": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'author', 'uniqueId']),
        callback: req => checkVideoCanAdd(req.body)
    },
    "/videos/create": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotNull(req, ['title', 'author', 'category', 'uploadTime']),
        callback: req => createVideo(req.body)
    },
    "/videos/edit": {
        disabled: true,
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: req => removeVideo(req.body['videoId'])
    },
    "/videos/delete": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: req => removeVideo(req.body['videoId'])
    },
    /** Category management */
    "/category/create": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeyNotBlank(req, 'category'),
        callback: req => addCategory(req.body['category'])
    },
    /** Storage management: Minio */
    "/storage/getInfo": {
        method: POST,
        needSecret,
        allowCIDR,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: req => searchMinio(req.body['videoId'])
    },
    "/storage/retryIngest": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => retryMinio(req.body['id']),
    },
    /** Policy management: FilterRules */
    "/policy/addRule": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'type', 'value', 'operator']),
        callback: req => handleFilterRule(req.body)
    },
    "/policy/removeRule": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'type', 'value', 'operator']),
        callback: req => handleFilterRule(req.body, false)
    },
}