import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { getActorImage, getSubjectCharacterImage, getSubjectCover } from '#modules/anime/service/bangumi/bangumiImagesService.js';

const { GET } = apiMethodConst;

/**
 * 番剧图片静态资源路由模块 (`/anime/images/*`)
 */
export default defineRoutes({
    basePath: '/anime/images',

    /**
     * 声优头像图片静态代理接口
     * 路由正则匹配：`/anime/images/actor/:actorId`
     */
    "/actor/(\\d+)$": {
        pathRegex: true,
        method: GET,
        ignoreSecret: true,
        callback: async (/** @type {ApiRequest} */ req, /** @type {ApiResponse} */ res) => {
            const actorId = req.params[0];
            if (__isBlank(actorId)) {
                __throwMessage('Not Found', -404, 404);
            }
            await getActorImage(actorId, res);
        }
    },

    /**
     * 番剧封面图片静态代理接口
     * 路由正则匹配：`/anime/images/subject/:subjectId/cover`
     */
    "/subject/(\\d+)/cover$": {
        pathRegex: true,
        method: GET,
        ignoreSecret: true,
        callback: async (/** @type {ApiRequest} */ req, /** @type {ApiResponse} */ res) => {
            const subjectId = req.params[0];
            if (__isBlank(subjectId)) {
                __throwMessage('Not Found', -404, 404);
            }
            await getSubjectCover(subjectId, res);
        }
    },

    /**
     * 番剧角色立绘图片静态代理接口
     * 路由正则匹配：`/anime/images/subject/:subjectId/character/:characterId`
     */
    "/subject/(\\d+)/character/(\\d+)$": {
        pathRegex: true,
        method: GET,
        ignoreSecret: true,
        callback: async (/** @type {ApiRequest} */ req, /** @type {ApiResponse} */ res) => {
            const subjectId = req.params[0];
            const characterId = req.params[1];
            if (__isAnyBlank(subjectId, characterId)) {
                __throwMessage('Not Found', -404, 404);
            }
            await getSubjectCharacterImage(subjectId, characterId, res);
        }
    }
})