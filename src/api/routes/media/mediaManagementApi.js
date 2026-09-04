import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import {
    checkBodyKeyMatch,
    checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank,
    checkBodyKeysNotNull,
    checkHeaderInside
} from '#utils/preCheckUtil.js';
import videoTagMapRep from '#modules/media/repository/videoTagMapRep.js';
import { getFilterRulesByCategory, handleFilterRule } from '#modules/media/service/mediaFilterService.js';
import {
    createMinioManually, deleteVideoMinio, retryMinio,
    searchMinio, updateMinioOriginUri, updateMinioTitleAndSort, updateVideoStatusByVideoMinioStatus
} from '#modules/media/service/mediaMinioService.js';
import { getTaskInfoAndDownloadStatus, removeTask } from '#modules/media/service/mediaTaskService.js';
import {
    addAuthor, addCategory, checkVideoCanAdd,
    cleanEmptyAuthor,
    createVideo, deleteAuthor, deleteCategory,
    removeVideo, removeVideoBatch, updateVideoTags, updateVideoTitle
} from '#modules/media/service/mediaVideoService.js';
import { getOptions, updateOption } from '#modules/media/service/mediaOptionsService.js';
import videosRep from '#modules/media/repository/videosRep.js';
import videoMinioRep from '#modules/media/repository/videoMinioRep.js';
import { allowLanHosts } from '#constants/allowHostsConst.js';
import {
    addPlaylistVideo, addPlaylistVideoBatch, createPlaylist,
    getPlaylistById,
    getPlaylistsByVideoId,
    removePlaylist,
    removePlaylistVideo, removePlaylistVideos, searchPlaylist,
    updatePlaylistTitle,
    updatePlaylistVideoSort,
    updatePlaylistVideoSortBatch
} from '#modules/media/service/mediaPlaylistService.js';
import { NEED_AUTH_CLIENT } from '#common/constants/authorizationConst.js';

const { POST } = apiMethodConst;
const needAuth = { clients: [NEED_AUTH_CLIENT.MANAGE] };

/** 获取媒体后台管理模块通信秘钥 */
const needSecret = () => "mAou5820.media.management";
const insideManagementSecret = "mAou5820.media.management-inside";

function isInsideRequest(req) {
    return parseInt(req.headers['inside']) === 1;
}

/**
 * 媒体后台全生命周期运维管理路由模块 (`/media/manage/*`)
 */
export default defineRoutes({
    basePath: "/media/manage",

    // ================= 视频管理 =================

    /**
     * 前置检查视频是否可入库添加
     * 请求体参数：{ category: string, author: string, uniqueId?: string }
     */
    "/videos/preCheck": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['category', 'author']),
        callback: (/** @type {ApiRequest} */ req) => checkVideoCanAdd(req.body)
    },

    /**
     * 创建视频并触发封面/视频源/弹幕解析
     * 请求体参数：MediaCreateOptions
     */
    "/videos/create": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotNull(req, ['title', 'author', 'category', 'uploadTime']),
        callback: (/** @type {ApiRequest} */ req) => createVideo(req.body)
    },

    /**
     * 修改视频标题
     * 请求体参数：{ id: number, title: string }
     */
    "/videos/updateTitle": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['id', 'title']),
        callback: (/** @type {ApiRequest} */ req) => updateVideoTitle(req.body['id'], req.body['title'])
    },

    /**
     * 更新视频标签 (UPDATE / ADD / REMOVE)
     * 请求体参数：{ id: number, operator: string, tags: string[] }
     */
    "/videos/updateTags": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['id', 'operator']) && checkBodyKeyNotEmptyArray(req, 'tags'),
        callback: (/** @type {ApiRequest} */ req) => updateVideoTags(req.body['id'], req.body['tags'], req.body['operator'])
    },

    /**
     * 级联删除单个视频（清理 MinIO 对象、本地文件、标签、收藏与播单）
     * 请求体参数：{ id: number }
     */
    "/videos/delete": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'id'),
        callback: (/** @type {ApiRequest} */ req) => removeVideo(req.body['id'])
    },

    /**
     * 批量删除视频
     * 请求体参数：{ ids: number[] }
     */
    "/videos/deleteBatch": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        maybeStream: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotEmptyArray(req, 'ids'),
        callback: (/** @type {ApiRequest} */ req) => removeVideoBatch(req.body['ids'])
    },

    /**
     * 重新根据关联 MinIO 资源推导并刷新视频综合状态与存储容量
     * 请求体参数：{ id: number }
     */
    "/videos/retryCalculation": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'id'),
        callback: (/** @type {ApiRequest} */ req) => updateVideoStatusByVideoMinioStatus(req.body['id'])
    },

    // ================= 分类管理 =================

    /**
     * 创建媒体分类
     * 请求体参数：{ category: string, inside: number(0|1) }
     */
    "/category/create": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['category', 'inside']) && checkBodyKeyMatch(req, 'inside', ['[0|1]']),
        callback: (/** @type {ApiRequest} */ req) => addCategory(req.body['category'], req.body['inside'])
    },

    /**
     * 删除指定分类
     * 请求体参数：{ id: number }
     */
    "/category/delete": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'id'),
        callback: (/** @type {ApiRequest} */ req) => deleteCategory(req.body['id'])
    },

    // ================= 创作者管理 =================

    /**
     * 创建创作者
     * 请求体参数：{ categoryId: number, name: string }
     */
    "/author/create": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['categoryId', 'name']),
        callback: (/** @type {ApiRequest} */ req) => addAuthor(req.body['name'], req.body['categoryId'])
    },

    /**
     * 删除创作者
     * 请求体参数：{ id: number }
     */
    "/author/delete": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        maybeStream: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'id'),
        callback: (/** @type {ApiRequest} */ req) => deleteAuthor(req.body['id'])
    },

    /**
     * 清理指定分类下无任何视频关联的孤儿创作者
     * 请求体参数：{ categoryId: number }
     */
    "/author/clean": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['categoryId']),
        callback: (/** @type {ApiRequest} */ req) => cleanEmptyAuthor(req.body['categoryId'])
    },

    // ================= 对象存储 MinIO 管理 =================

    /**
     * 查询指定视频关联的全部 MinIO 资源及任务详情
     * 请求体参数：{ videoId: number }
     */
    "/storage/getInfo": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'videoId'),
        callback: (/** @type {ApiRequest} */ req) => searchMinio(req.body['videoId'])
    },

    /**
     * 手动创建单条 MinIO 存储任务并上传
     * 请求体参数：MediaMinioCreateOptions
     */
    "/storage/create": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['videoId', 'type', 'uri']),
        callback: (/** @type {ApiRequest} */ req) => createMinioManually(req.body)
    },

    /**
     * 更新失败 MinIO 任务的源 URI
     * 请求体参数：{ id: number, uri: string }
     */
    "/storage/updateOriginUri": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['id', 'uri']),
        callback: (/** @type {ApiRequest} */ req) => updateMinioOriginUri(req.body['id'], req.body['uri'])
    },

    /**
     * 删除指定 MinIO 存储资源
     * 请求体参数：{ id: number }
     */
    "/storage/delete": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'id'),
        callback: (/** @type {ApiRequest} */ req) => deleteVideoMinio(req.body['id'])
    },

    /**
     * 重试执行失败的 MinIO 资源抓取或上传
     * 请求体参数：{ id: number }
     */
    "/storage/retryIngest": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'id'),
        callback: (/** @type {ApiRequest} */ req) => retryMinio(req.body['id'])
    },

    /**
     * 修改 MinIO 资源标题或排序权重
     * 请求体参数：{ id: number, title?: string, sort?: number }
     */
    "/storage/updateTitleOrSort": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'id'),
        callback: (/** @type {ApiRequest} */ req) => updateMinioTitleAndSort(req.body)
    },

    /**
     * 复合轮询多任务与视频 MinIO 资源实时状态
     * 请求体参数：{ videoId: number, taskIds?: number[], sourceIds?: number[] }
     */
    "/storage/multiStatus": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => {
            checkBodyKeyNotBlank(req, 'videoId');
            try {
                checkBodyKeyNotEmptyArray(req, 'taskIds');
            } catch (error) {
                checkBodyKeyNotEmptyArray(req, 'sourceIds');
            }
        },
        callback: async (/** @type {ApiRequest} */ req) => {
            const result = { tasks: {}, sources: {}, videoStatus: null, videoTotalSize: null };
            const { videoId, taskIds = [], sourceIds = [] } = req.body;
            await Promise.all([
                videosRep.selectOne(videoId).then(video => { result.videoStatus = video?.status ?? null; result.videoTotalSize = video?.totalSize ?? null; }),
                videoMinioRep.selectByMinioIds(sourceIds).then(({ data }) => data?.forEach(d => result.sources[d.id] = { status: d.status, size: d.objectSize })),
                getTaskInfoAndDownloadStatus(taskIds).then(r => result.tasks = r)
            ]);
            return result;
        }
    },

    /**
     * 移除指定的 Aria2 离线下载任务
     * 请求体参数：{ taskId: number }
     */
    "/storage/deleteTask": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'taskId'),
        callback: (/** @type {ApiRequest} */ req) => removeTask(req.body['taskId'])
    },

    // ================= 策略规则管理 =================

    /**
     * 获取指定分类下的黑白名单过滤规则集合
     * 请求体参数：{ category: string }
     */
    "/policy/getRules": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'category'),
        callback: (/** @type {ApiRequest} */ req) => getFilterRulesByCategory(req.body['category'])
    },

    /**
     * 添加黑白名单过滤规则
     * 请求体参数：{ category: string, type: number, value: string, operator: '0'|'1' }
     */
    "/policy/addRule": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['category', 'type', 'value', 'operator']),
        callback: (/** @type {ApiRequest} */ req) => handleFilterRule(req.body)
    },

    /**
     * 删除黑白名单过滤规则
     * 请求体参数：{ category: string, type: number, value: string, operator: '0'|'1' }
     */
    "/policy/removeRule": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['category', 'type', 'value', 'operator']),
        callback: (/** @type {ApiRequest} */ req) => handleFilterRule(req.body, false)
    },

    // ================= 标签映射管理 =================

    /**
     * 清理孤儿脏 video_tag_map 映射记录
     */
    "/videosTagMapping/clean": {
        method: POST,
        needSecret,
        needAuth: { clients: [NEED_AUTH_CLIENT.MANAGE, NEED_AUTH_CLIENT.API_POST] },
        allowHosts: allowLanHosts,
        callback: async () => {
            const deletedVideoIds = await videoTagMapRep.deleteDirtyVideoTagMapping();
            __log.info("[Video Tags Mapping] Cleaned mappings: ", deletedVideoIds);
            return { rows: deletedVideoIds?.length ?? 0 };
        }
    },

    // ================= 系统配置项管理 =================

    /**
     * 获取媒体模块全量配置项
     */
    "/options/getAllOptions": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        callback: () => getOptions()
    },

    /**
     * 修改单条配置项
     * 请求体参数：{ id: number, value: string, description: string }
     */
    '/options/updateOne': {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['id', 'value', 'description']),
        callback: (/** @type {ApiRequest} */ req) => updateOption(req.body.id, req.body.description, req.body.value)
    },

    // ================= 播单管理 =================

    /**
     * 根据视频 ID 查询所属播单列表
     * 请求体参数：{ videoId: number }
     */
    "/playlist/getByVideo": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeyNotBlank(req, 'videoId'),
        callback: async (/** @type {ApiRequest} */ req) => getPlaylistsByVideoId(req.body.videoId)
    },

    /**
     * 分页多条件检索播单列表
     * 请求体参数：{ categoryId?: number, title?: string, pageNum?: number, pageSize?: number }
     */
    "/playlist/getSearch": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret),
        callback: async (/** @type {ApiRequest} */ req) => searchPlaylist(req.body, isInsideRequest(req))
    },

    /**
     * 创建播单
     * 请求体参数：{ categoryId: number, title: string }
     */
    "/playlist/create": {
        method: POST,
        ignoreSecret: true,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeysNotBlank(req, ['categoryId', 'title']),
        callback: async (/** @type {ApiRequest} */ req) => createPlaylist(req.body.categoryId, req.body.title)
    },

    /**
     * 修改播单标题
     * 请求体参数：{ id: number, title: string }
     */
    "/playlist/updateTitle": {
        method: POST,
        ignoreSecret: true,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeysNotBlank(req, ['id', 'title']),
        callback: async (/** @type {ApiRequest} */ req) => updatePlaylistTitle(req.body.id, req.body.title)
    },

    /**
     * 删除播单
     * 请求体参数：{ id: number }
     */
    "/playlist/remove": {
        method: POST,
        ignoreSecret: true,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeyNotBlank(req, 'id'),
        callback: async (/** @type {ApiRequest} */ req) => removePlaylist(req.body.id)
    },

    /**
     * 获取指定播单关联的视频列表
     * 请求体参数：{ id: number }
     */
    "/playlist/videos": {
        method: POST,
        ignoreSecret: true,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeyNotBlank(req, 'id'),
        callback: async (/** @type {ApiRequest} */ req) => getPlaylistById(req.body.id)
    },

    /**
     * 向播单添加视频
     * 请求体参数：{ id: number, videoId: number, sort?: number }
     */
    "/playlist/addVideo": {
        method: POST,
        ignoreSecret: true,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeysNotBlank(req, ['id', 'videoId']),
        callback: async (/** @type {ApiRequest} */ req) => addPlaylistVideo(req.body.id, req.body.videoId, req.body.sort)
    },

    /**
     * 批量向播单添加视频
     * 请求体参数：{ arr: Array<{ id: number, videoId: number, sort?: number }> }
     */
    "/playlist/addVideoBatch": {
        method: POST,
        ignoreSecret: true,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeyNotEmptyArray(req, 'arr'),
        callback: async (/** @type {ApiRequest} */ req) => addPlaylistVideoBatch(req.body.arr)
    },

    /**
     * 修改播单内视频排序权重
     * 请求体参数：{ id: number, videoId: number, sort: number }
     */
    "/playlist/updateVideoSort": {
        method: POST,
        ignoreSecret: true,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeysNotBlank(req, ['id', 'videoId', 'sort']),
        callback: async (/** @type {ApiRequest} */ req) => updatePlaylistVideoSort(req.body.id, req.body.videoId, req.body.sort)
    },

    /**
     * 批量修改播单关联视频的排序权重
     * 请求体参数：{ arr: Array<{ id: number, sort: number }> }
     */
    "/playlist/updateVideoSortBatch": {
        method: POST,
        ignoreSecret: true,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeyNotEmptyArray(req, "arr"),
        callback: async (/** @type {ApiRequest} */ req) => updatePlaylistVideoSortBatch(req.body.arr)
    },

    /**
     * 从播单中移除单个视频
     * 请求体参数：{ id: number, videoId: number }
     */
    "/playlist/removeVideo": {
        method: POST,
        ignoreSecret: true,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeysNotBlank(req, ['id', 'videoId']),
        callback: async (/** @type {ApiRequest} */ req) => removePlaylistVideo(req.body.id, req.body.videoId)
    },

    /**
     * 从播单中批量移除多个视频
     * 请求体参数：{ id: number, videos: number[] }
     */
    "/playlist/removeVideoBatch": {
        method: POST,
        ignoreSecret: true,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkHeaderInside(req, needSecret(), insideManagementSecret)
            && checkBodyKeyNotBlank(req, 'id') && checkBodyKeyNotEmptyArray(req, 'videos'),
        callback: async (/** @type {ApiRequest} */ req) => removePlaylistVideos(req.body.id, req.body.videos)
    }
});