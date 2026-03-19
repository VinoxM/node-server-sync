import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank, checkBodyKeysNotNull } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { addCategory, createVideo, checkVideoCanAdd, removeVideo, deleteCategory, updateVideoTitle, updateVideoTags, addAuthor, deleteAuthor } from "../../handler/media/mediaVideoHandler.js"
import { MEDIA_ALLOW_HOSTS as allowHosts } from "../../constraints/mediaConst.js"
import { createMinioManually, deleteVideoMinio, retryMinio, searchMinio, updateMinioOriginUri, updateVideoStatusByVideoMinioStatus } from "../../handler/media/mediaMinioHandler.js"
import { getFilterRulesByCategory, handleFilterRule } from "../../handler/media/mediaFilterHandler.js"
import { removeAria2Task } from "../../handler/media/mediaAria2Handler.js"
import videoTagMapRep from "../../repository/media/videoTagMapRep.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.management"

export default {
    basePath: "/media/manage",
    /** Videos management */
    "/videos/preCheck": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'author', 'uniqueId']),
        callback: req => checkVideoCanAdd(req.body)
    },
    "/videos/create": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotNull(req, ['title', 'author', 'category', 'uploadTime']),
        callback: req => createVideo(req.body)
    },
    "/videos/updateTitle": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'title']),
        callback: req => updateVideoTitle(req.body['id'], req.body['title'])
    },
    "/videos/updateTags": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'operator']) && checkBodyKeyNotEmptyArray(req, ['tags']),
        callback: req => updateVideoTags(req.body['id'], req.body['tags'], req.body['operator'])
    },
    "/videos/delete": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => removeVideo(req.body['id'])
    },
    "/videos/retryCalculation": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => updateVideoStatusByVideoMinioStatus(req.body['id'])
    },
    /** Category management */
    "/category/create": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'category'),
        callback: req => addCategory(req.body['category'])
    },
    "/category/delete": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => deleteCategory(req.body['id'])
    },
    /** Author management */
    "/author/create": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['categoryId', 'name']),
        callback: req => addAuthor(req.body['name'], req.body['categoryId'])
    },
    "/author/delete": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => deleteAuthor(req.body['id'])
    },
    /** Storage management: Minio */
    "/storage/getInfo": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: req => searchMinio(req.body['videoId'])
    },
    "/storage/create": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['videoId', 'type', 'uri']),
        callback: req => createMinioManually(req.body)
    },
    "/storage/updateOriginUri": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'uri']),
        callback: req => updateMinioOriginUri(req.body['id'], req.body['uri'])
    },
    "/storage/delete": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => deleteVideoMinio(req.body['id'])
    },
    "/storage/retryIngest": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => retryMinio(req.body['id']),
    },
    /** Task */
    "/storage/deleteTask": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => removeAria2Task(req.body['taskId']),
    },
    /** Policy management: FilterRules */
    "/policy/getRules": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'category'),
        callback: req => getFilterRulesByCategory(req.body['category'])
    },
    "/policy/addRule": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'type', 'value', 'operator']),
        callback: req => handleFilterRule(req.body)
    },
    "/policy/removeRule": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'type', 'value', 'operator']),
        callback: req => handleFilterRule(req.body, false)
    },
    /** Video Tag Mapping management */
    "/videosTagMapping/clean": {
        method: POST,
        needSecret,
        allowHosts,
        callback: async () => {
            const deletedVideoIds = await videoTagMapRep.deleteDirtyVideoTagMapping()
            __log.info("[Video Tags Mapping] Cleaned mappings: ", deletedVideoIds)
            return { rows: deletedVideoIds?.length ?? 0 }
        }
    }
}