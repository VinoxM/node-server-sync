import apiMethodConst from "../../../common/constants/apiMethodConst.js"
import {
    checkBodyKeyMatch,
    checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank,
    checkBodyKeysNotNull
} from "../../../common/utils/preCheckUtil.js"
import videoTagMapRep from "../../../modules/media/repository/videoTagMapRep.js"
import { getFilterRulesByCategory, handleFilterRule } from "../../../modules/media/service/mediaFilterService.js"
import {
    createMinioManually, deleteVideoMinio, retryMinio,
    searchMinio, updateMinioOriginUri, updateMinioTitleAndSort, updateVideoStatusByVideoMinioStatus
} from "../../../modules/media/service/mediaMinioService.js"
import { getTaskInfoAndDownloadStatus, removeTask } from "../../../modules/media/service/mediaTaskService.js"
import {
    addAuthor, addCategory, checkVideoCanAdd,
    createVideo, deleteAuthor, deleteCategory,
    removeVideo, updateVideoTags, updateVideoTitle
} from "../../../modules/media/service/mediaVideoService.js"
import { MEDIA_ALLOW_HOSTS as allowHosts } from "../../../modules/media/constants/mediaConst.js"
import { getOptions, updateOption } from "../../../modules/media/service/mediaOptionsService.js"
import videosRep from "../../../modules/media/repository/videosRep.js"
import videoMinioRep from "../../../modules/media/repository/videoMinioRep.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.management"

export default {
    basePath: "/media/manage",
    /** Videos management */
    "/videos/preCheck": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'author']),
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
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'inside']) && checkBodyKeyMatch(req, 'inside', ['[0|1]']),
        callback: req => addCategory(req.body['category'], req.body['inside'])
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
    "/storage/updateTitleOrSort": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => updateMinioTitleAndSort(req.body),
    },
    "/storage/multiStatus": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => {
            checkBodyKeyNotBlank(req, 'videoId')
            try {
                checkBodyKeyNotEmptyArray(req, 'taskIds')
            } catch (error) {
                checkBodyKeyNotEmptyArray(req, 'sourceIds')
            }
        },
        callback: async req => {
            const result = { tasks: {}, sources: {}, videoStatus: null }
            const { videoId, taskIds = [], sourceIds = [] } = req.body
            await Promise.all([
                videosRep.selectOne(videoId).then(video => { result.videoStatus = video?.status ?? null; result.videoTotalSize = video?.totalSize ?? null; }),
                videoMinioRep.selectByMinioIds(sourceIds).then(({ data }) => data?.forEach(d => result.sources[d.id] = { status: d.status, size: d.objectSize })),
                getTaskInfoAndDownloadStatus(taskIds).then(r => result.tasks = r)
            ])
            return result
        },
    },
    /** Task */
    "/storage/deleteTask": {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'taskId'),
        callback: req => removeTask(req.body['taskId']),
    },
    /** Policy management: FilterRules */
    "/policy/getRules": {
        method: POST,
        needSecret,
        allowHosts,
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
    },
    /** Media Options */
    "/options/getAllOptions": {
        method: POST,
        needSecret,
        allowHosts,
        callback: req => getOptions()
    },
    '/options/updateOne': {
        method: POST,
        needSecret,
        allowHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'value', 'description']),
        callback: req => updateOption(req.body.id, req.body.description, req.body.value)
    }
}