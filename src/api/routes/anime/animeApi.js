import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { getNextSeason } from '#utils/dateUtil.js';
import { checkBodyKeyMatch, checkBodyKeysExists, checkBodyKeysNotBlank, checkQueryKeyNotBlank } from '#utils/preCheckUtil.js';
import { pullAnimeSubjects, pullCurrentSeasonAnime } from '#modules/anime/service/subject/subjectPullService.js';
import { getAnimeCalendar, getAnimeInformation, getUserFavoitesAnime, getUserPlayHistory, searchAnime } from '#modules/anime/service/animeService.js';
import { decodeAuthorization } from '#modules/authorization/authorizationService.js';
import { allowLanHosts } from '#common/constants/allowHostsConst.js';
import { getRssEpisodeSource } from '#modules/anime/service/rssService.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import { SUBJECT_PLATFORM_SEARCH_MAPPING, SUBSCRIBE_FIN_VALUE } from '#modules/anime/constants/subjectConstant.js';
import { saveAnimeProgress } from '#modules/anime/service/animeProgressService.js';

const { GET, POST } = apiMethodConst;

/** 获取番剧路由通信秘钥 */
const needSecret = () => 'mAou5820.anime';
const needAuth = needAuthSingleClient.ANIME;

/**
 * 番剧放送日历与条目详情公开/前台路由模块 (`/anime/*`)
 */
export default defineRoutes({
    basePath: '/anime',

    /**
     * 多维条件检索番剧列表（支持卡片分页模式与日历模式，登录用户可查看 NSFW 内容）
     * 请求体参数：{ season?: string, name?: string, platform?: string, fin?: number, viewMode: 0|1, pageNum?: number, pageSize?: number }
     */
    "/search": {
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysExists(req, ['season', 'name', 'platform', 'fin', 'pageSize', 'pageNum'])
            && checkBodyKeyMatch(req, 'viewMode', [/^[01]{1}$/]),
        callback: async (req) => {
            const { season, name, platform, fin } = req.body;
            __isAllBlank(season, name, platform, fin) && __throwMessage('Empty filters.');
            __isNotBlank(platform) && !Object.keys(SUBJECT_PLATFORM_SEARCH_MAPPING).includes(platform) && __throwMessage('Invalid platform filter.');
            __isNotBlank(fin) && !Object.values(SUBSCRIBE_FIN_VALUE).includes(fin) && __throwMessage('Invalid fin filter.');
            const userInfo = await decodeAuthorization(req);
            return searchAnime(req.body, userInfo);
        }
    },

    /**
     * 获取当前季度的全量番剧放送日历数据（紧凑视图）
     */
    "/calendar": {
        method: GET,
        needSecret,
        callback: async (req) => {
            const userInfo = await decodeAuthorization(req);
            return getAnimeCalendar(userInfo);
        }
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
            const userInfo = await decodeAuthorization(req);
            return getAnimeInformation(req.query.id, userInfo);
        }
    },

    /**
     * 获取当前登录用户收藏的所有番剧列表（日历紧凑视图）
     */
    "/getUserFavorites": {
        method: GET,
        needSecret,
        needAuth,
        callback: async req => {
            const userInfo = await decodeAuthorization(req);
            return getUserFavoitesAnime(userInfo);
        }
    },

    /**
     * 获取指定剧集的视频播放源、内嵌字幕及关联字体资源
     * 请求体参数：{ rssSubsId: number, episode: number|string }
     */
    "/getEpisodeSource": {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret,
        needAuth,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['rssSubsId', 'episode']),
        callback: async req => {
            const userInfo = await decodeAuthorization(req);
            userInfo || __throwMessage('Permission denied.', -401, 401);
            return getRssEpisodeSource(req.body.rssSubsId, req.body.episode, userInfo);
        }
    },

    /**
     * 获取用户的播放历史记录
     * 请求体参数：{ pageNum: number, pageSize: number }
     */
    "/getUserPlayHistory": {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret,
        // needAuth,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['pageNum', 'pageSize']),
        callback: async req => {
            const userInfo = await decodeAuthorization(req);
            userInfo || __throwMessage('Permission denied.', -401, 401);
            return getUserPlayHistory(userInfo, req.body.pageNum, req.body.pageSize);
        }
    },

    /**
     * 保存指定剧集的视频的播放进度
     * 请求体参数：{ subjectId: number, episode: number|string, duration: number, currentTime: number }
     */
    "/saveProgress": {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret,
        needAuth,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['subjectId', 'episode', 'duration', 'currentTime']),
        callback: async req => {
            const userInfo = await decodeAuthorization(req);
            userInfo || __throwMessage('Permission denied.', -401, 401);
            const { subjectId, episode, duration, currentTime } = req.body;
            return saveAnimeProgress(userInfo, subjectId, episode, { duration, currentTime });
        }
    },

    /**
     * 从 Bangumi API 拉取、清洗并同步番剧数据到数据库（默认禁用，通过后台任务/管理接口调用）
     * 请求体参数：{ season?: '2026-10', force?: boolean }
     */
    "/pullAnime": {
        disabled: true,
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
    }
});