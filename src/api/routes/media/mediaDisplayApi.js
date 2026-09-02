import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import categoriesRep from '#modules/media/repository/categoriesRep.js';
import authorsRep from '#modules/media/repository/authorsRep.js';
import videoTagMapRep from '#modules/media/repository/videoTagMapRep.js';
import {
    checkBodyKeyMatch,
    checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray,
    checkBodyKeysNotBlank, checkHeaderInside,
    checkQueryKeyNotBlank
} from '#utils/preCheckUtil.js';
import { checkVideoFilterRules } from '#modules/media/service/mediaFilterService.js';
import { checkCategoryExistsByInside, searchVideos } from '#modules/media/service/mediaVideoService.js';
import { getMinioClientMatchers } from '#modules/media/service/mediaMinioService.js';
import videoMinioRep from '#modules/media/repository/videoMinioRep.js';
import videosRep from '#modules/media/repository/videosRep.js';
import { allowLanHosts } from '#constants/allowHostsConst.js';
import { decodeAuthorization } from '#modules/authorization/authorizationService.js';
import { addUserFavorites, checkFavorites, getUserFavorites, removeUserFavorites } from '#modules/media/service/mediaFavoritesService.js';
import { FAVORITES_TARGET_TYPE } from '#modules/media/constants/favoritesConst.js';
import { getPlaylistByVideoId } from '#modules/media/service/mediaPlaylistService.js';

const { GET, POST } = apiMethodConst;

/** 获取媒体前台展示模块通信秘钥 */
const needSecret = () => "mAou5820.media.display";
const insideDisplaySecret = "mAou5820.media.display-inside";

function checkInsideHeader(req) {
    return checkHeaderInside(req, needSecret(), insideDisplaySecret);
}

function isInsideRequest(req) {
    return parseInt(req.headers['inside']) === 1;
}

/**
 * 媒体视频前台展示、播放与检索路由模块 (`/media/display/*`)
 */
export default defineRoutes({
    basePath: "/media/display",

    /**
     * 获取 24 小时内最新入库视频数量 (角标)
     */
    "/getNewestCount": {
        method: GET,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        callback: (/** @type {ApiRequest} */ req) => videosRep.countForCardView(isInsideRequest(req))
    },

    /**
     * 复合条件分页检索视频列表
     * 请求体参数：MediaSearchOptions
     */
    "/searchVideos": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkInsideHeader(req),
        callback: async (/** @type {ApiRequest} */ req) => {
            const userInfo = await decodeAuthorization(req);
            return searchVideos(req.body, isInsideRequest(req), userInfo?.id);
        }
    },

    /**
     * 获取分类列表 (区分普通分类与内部私密分类)
     */
    "/getCategories": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkInsideHeader(req),
        callback: (/** @type {ApiRequest} */ req) => categoriesRep.selectByInside(isInsideRequest(req)).then(({ data }) => data)
    },

    /**
     * 获取指定分类下的创作者列表 (支持按最新上传与收藏优先排序)
     * 请求体参数：{ categoryId: number, authorName?: string }
     */
    "/getAuthors": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'categoryId') && checkInsideHeader(req),
        callback: async (/** @type {ApiRequest} */ req) => {
            const categoryId = req.body['categoryId'];
            const inside = parseInt(req.headers['inside']);
            await checkCategoryExistsByInside(categoryId, inside);
            const userInfo = await decodeAuthorization(req);
            if (userInfo) {
                return authorsRep.selectAuthorsByLatestUploadWithFavorites(categoryId, req.body['authorName'], userInfo.id).then(({ data }) => data);
            }
            return authorsRep.selectAuthorsByLatestUpload(categoryId, req.body['authorName']).then(({ data }) => data);
        }
    },

    /**
     * 获取指定分类下的标签列表及使用频次统计
     * 请求体参数：{ categoryId: number, videoId?: number }
     */
    "/getTags": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'categoryId') && checkInsideHeader(req),
        callback: async (/** @type {ApiRequest} */ req) => {
            const { videoId, categoryId } = req.body;
            const inside = parseInt(req.headers['inside']);
            await checkCategoryExistsByInside(categoryId, inside);
            return videoTagMapRep.selectTagsWithCount(categoryId, videoId).then(({ data }) => data);
        }
    },

    /**
     * 查询单视频基础播放信息 (标题、分类、作者等)
     * 请求体参数：{ videoId: number }
     */
    "/getVideoDetail": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'videoId'),
        callback: (/** @type {ApiRequest} */ req) => videosRep.selectForPlay(req.body.videoId)
    },

    /**
     * 查询指定视频已就绪的视频源播放列表
     * 请求体参数：{ videoId: number }
     */
    "/getSources": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'videoId'),
        callback: async (/** @type {ApiRequest} */ req) => videoMinioRep.selectSourceByVideoId(req.body['videoId']).then(({ data }) => data)
    },

    /**
     * 查询指定视频已就绪的弹幕资源列表
     * 请求体参数：{ videoId: number }
     */
    "/getBarrage": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'videoId'),
        callback: async (/** @type {ApiRequest} */ req) => videoMinioRep.selectBarrageByVideoId(req.body['videoId']).then(({ data }) => data)
    },

    /**
     * 批量校验视频是否符合黑白名单规则与入库可行性
     * 请求体参数：{ category: string, rules: MediaFilterCheckRule[] }
     */
    "/videos/checkPolicy": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['category']) && checkBodyKeyNotEmptyArray(req, 'rules'),
        callback: (/** @type {ApiRequest} */ req) => checkVideoFilterRules(req.body)
    },

    /**
     * 获取当前 MinIO 客户端标签与路由匹配正则列表
     */
    "/getClientMatchers": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        callback: (/** @type {ApiRequest} */ req) => getMinioClientMatchers(req.body)
    },

    // ================= 收藏相关 =================

    /**
     * 获取用户收藏的视频列表
     */
    "/getFavoritesVideo": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        needAuth: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkInsideHeader(req),
        callback: async (/** @type {ApiRequest} */ req) => {
            const userInfo = await decodeAuthorization(req);
            userInfo || __throwMessage('Permission denied.', -401, 401);
            return getUserFavorites(userInfo.id, FAVORITES_TARGET_TYPE.VIDEO, isInsideRequest(req));
        }
    },

    /**
     * 获取用户收藏的创作者列表
     */
    "/getFavoritesAuthor": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        needAuth: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkInsideHeader(req),
        callback: async (/** @type {ApiRequest} */ req) => {
            const userInfo = await decodeAuthorization(req);
            userInfo || __throwMessage('Permission denied.', -401, 401);
            return getUserFavorites(userInfo.id, FAVORITES_TARGET_TYPE.AUTHOR, isInsideRequest(req));
        }
    },

    /**
     * 添加一条收藏记录 (创作者或视频)
     * 请求体参数：{ targetType: '1'|'2', targetId: number }
     */
    "/addFavorites": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        needAuth: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyMatch(req, 'targetType', [Object.values(FAVORITES_TARGET_TYPE).join("|")]) && checkBodyKeyNotBlank(req, 'targetId'),
        callback: async (/** @type {ApiRequest} */ req) => {
            const userInfo = await decodeAuthorization(req);
            userInfo || __throwMessage('Permission denied.', -401, 401);
            return addUserFavorites(userInfo.id, req.body.targetType, req.body.targetId);
        }
    },

    /**
     * 取消/删除一条收藏记录
     * 请求体参数：{ targetType: '1'|'2', targetId: number }
     */
    "/removeFavorites": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        needAuth: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyMatch(req, 'targetType', [Object.values(FAVORITES_TARGET_TYPE).join("|")]) && checkBodyKeyNotBlank(req, 'targetId'),
        callback: async (/** @type {ApiRequest} */ req) => {
            const userInfo = await decodeAuthorization(req);
            userInfo || __throwMessage('Permission denied.', -401, 401);
            return removeUserFavorites(userInfo.id, req.body.targetType, req.body.targetId);
        }
    },

    /**
     * 批量检查用户对多个目标的收藏状态
     * 请求体参数：{ payload: Array<{ targetId: number, targetType: string }> }
     */
    "/checkFavorites": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        needAuth: true,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotEmptyArray(req, 'payload'),
        callback: async (/** @type {ApiRequest} */ req) => {
            const userInfo = await decodeAuthorization(req);
            userInfo || __throwMessage('Permission denied.', -401, 401);
            return checkFavorites(userInfo.id, req.body.payload);
        }
    },

    // ================= 播单相关 =================

    /**
     * 根据视频 ID 查询所属播单列表及可播放视频清单
     */
    "/getVideoPlaylists": {
        method: GET,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (/** @type {ApiRequest} */ req) => checkQueryKeyNotBlank(req, 'videoId'),
        callback: (/** @type {ApiRequest} */ req) => getPlaylistByVideoId(req.query.videoId)
    }
});