import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { getNextSeason } from '#utils/dateUtil.js';
import { checkQueryKeyNotBlank } from '#utils/preCheckUtil.js';
import { getActorImage, getSubjectCharacterImage, getSubjectCover } from '#modules/anime/service/bangumi/bangumiImagesService.js';
import { pullAnimeSubjects, pullCurrentSeasonAnime } from '#modules/anime/service/subjects/subjectPullService.js';
import { getAnimeCalendar, getAnimeInformation } from '#modules/anime/service/subjects/subjectSearchService.js';
import { decodeAuthorization } from '#modules/authorization/authorizationService.js';

const { GET, POST } = apiMethodConst;

/** 获取番剧路由通信秘钥 */
const needSecret = () => 'mAou5820.anime';

/**
 * 番剧放送日历、条目详情与图片静态资源路由模块 (`/anime/*`)
 */
export default defineRoutes({
    basePath: '/anime',

    /**
     * 获取当前季度的全量番剧放送日历数据
     */
    "/calendar": {
        method: GET,
        needSecret,
        callback: () => getAnimeCalendar()
    },

    /**
     * 根据番剧 ID 获取完整番剧详情（含别名、Staff、角色声优、RSS 抓取结果与已就绪剧集）
     * 查询参数：`?id=12345`
     */
    "/information": {
        method: GET,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkQueryKeyNotBlank(req, 'id'),
        callback: async (/** @type {ApiRequest} */ req) => {
            const userInfo = await decodeAuthorization(req, 1);
            return getAnimeInformation(req.query.id, userInfo);
        }
    },

    /**
     * 从 Bangumi API 拉取、清洗并同步番剧数据到数据库
     * 请求体参数：{ season?: '2026-10', force?: boolean }
     */
    "/pullAnime": {
        method: POST,
        needSecret,
        callback: (/** @type {ApiRequest} */ req) => {
            const forceUpdate = req.body?.force === 'true' || Boolean(req.body?.force);
            const options = { forceUpdate, insertSubscribe: true };
            if (__isNotBlank(req.body?.season)) {
                /^[0-9]{4}-(01|04|07|10)$/.test(req.body.season) || __throwMessage('Invalid season.');
                const [year, month] = req.body.season.split('-');
                const startDate = `${year}-${month}-01`;
                const [nextYear, nextMonth] = getNextSeason([year, month]);
                const endDate = `${nextYear}-${nextMonth}-01`;
                return pullAnimeSubjects([startDate, endDate], options);
            }
            return pullCurrentSeasonAnime(options);
        }
    },

    // ================= 图片静态资源流式响应 =================

    /**
     * 声优头像图片静态代理接口
     * 路由正则匹配：`/anime/images/actor/:actorId`
     */
    "/images/actor/(\\d+)$": {
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
    "/images/subject/(\\d+)/cover$": {
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
    "/images/subject/(\\d+)/character/(\\d+)$": {
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
});