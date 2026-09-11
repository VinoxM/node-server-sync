import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { getNextSeason } from '#utils/dateUtil.js';
import { checkBodyKeysExists, checkBodyKeysNotBlank, checkQueryKeyNotBlank } from '#utils/preCheckUtil.js';
import { pullAnimeSubjects, pullCurrentSeasonAnime } from '#modules/anime/service/subject/subjectPullService.js';
import { getAnimeCalendar, getAnimeInformation, searchAnime } from '#modules/anime/service/animeService.js';
import { decodeAuthorization } from '#modules/authorization/authorizationService.js';
import { allowLanHosts } from '#common/constants/allowHostsConst.js';
import { getRssEpisodeSource } from '#modules/anime/service/rssService.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import { SUBJECT_PLATFORM_SEARCH_MAPPING, SUBSCRIBE_FIN_VALUE } from '#modules/anime/constants/subjectConstant.js';

const { GET, POST } = apiMethodConst;

/** 获取番剧路由通信秘钥 */
const needSecret = () => 'mAou5820.anime';

/**
 * 番剧放送日历、条目详情路由模块 (`/anime/*`)
 */
export default defineRoutes({
    basePath: '/anime',

    "/search": {
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysExists(req, ['season', 'name', 'platform', 'fin']) && checkBodyKeysNotBlank(req, ['pageSize', 'pageNum']),
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
     * 获取当前季度的全量番剧放送日历数据
     */
    "/calendar": {
        method: GET,
        needSecret,
        callback: async (req) => {
            const userInfo = await decodeAuthorization(req);
            return getAnimeCalendar(userInfo)
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

    "/getEpisodeSource": {
        method: POST,
        needAuth: needAuthSingleClient.ANIME,
        allowHosts: allowLanHosts,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['rssSubsId', 'episode']),
        callback: req => getRssEpisodeSource(req.body.rssSubsId, req.body.episode)
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
});