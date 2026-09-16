import { getCurSeason } from "#utils/dateUtil.js";
import rssEpisodeRep from "#modules/anime/repository/rss/rssEpisodeRep.js";
import { SUBJECT_NSFW_VALUE, SUBJECT_PLATFORM_DEFAULT, SUBJECT_PLATFORM_IS_SHORT } from "#modules/anime/constants/subjectConstant.js";
import rssResultRep from "#modules/anime/repository/rss/rssResultRep.js";
import rssTrackerRep from "#modules/anime/repository/rss/rssTrackerRep.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import { handleSubjectView } from "#modules/anime/service/subject/subjectService.js";
import rssTaskRep from "#modules/anime/repository/rss/rssTaskRep.js";
import { filterUserRssFavoritesWithUid } from "#modules/account/service/rssFavoritesService.js";

/**
 * 格式化番剧数据为日历紧凑视图结构
 * @param {Array<any>} data - 原始番剧列表
 * @param {UserInfo} [userInfo] - 用户信息（未登录时过滤 NSFW 内容）
 * @returns {Array<import('#types/animeTypes.d.ts').AnimeCalendarItem>}
 */
function handleCalendar(data, userInfo) {
    let list = userInfo ? data : data.filter(o => o.nsfw === SUBJECT_NSFW_VALUE.NO);
    let now = new Date();
    const nowTimestamp = now.getTime();
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }
    return list.map(obj => {
        const { startTime } = obj;
        let date = new Date(startTime);
        if (startTime === 0 || startTime === null || startTime === undefined) {
            date = new Date(obj.season + '-01');
        }
        let startDate = `${date.getFullYear()}${(date.getMonth() + 1 + '').padStart(2, '0')}${(date.getDate() + '').padStart(2, '0')}`;
        let hours = date.getHours();
        let minutes = date.getMinutes();
        if (hours >= 0 && hours < 6) {
            date.setDate(date.getDate() - 1);
            hours += 24;
        }
        let updateTime = `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
        const isTV = obj.platform === SUBJECT_PLATFORM_DEFAULT || JSON.parse(obj.metaTags || '[]').includes?.(SUBJECT_PLATFORM_DEFAULT);
        const isShort = obj.platform === SUBJECT_PLATFORM_IS_SHORT;
        let type = `${isShort ? 1 : 0}${(isTV || isShort) ? 0 : 1}`;
        let status = now.getTime() - date.getTime() < 0 ? 0 : (obj.fin === 0 ? 1 : 2);
        const lastPubDatetime = new Date(obj.lastPub).getTime();
        const hasNew = obj.lastPub && (nowTimestamp - lastPubDatetime < 24 * 60 * 60 * 1000) ? 1 : 0;
        return {
            Z: obj.nameCN, // name
            J: obj.name, // nameJP
            D: startDate + updateTime + date.getDay(), // startDate. ep: '2024010210000'
            C: obj.cover, // cover
            T: type, // type. isShort(0/1) concat isWeb(0/1)
            S: status, // status. enum: 0-not start/1-broadcasting/2-fin
            E: (obj.latestEp || '') + ':' + obj.totalEpisodes || 0, // lastEp
            N: hasNew, // hasNew. enum: 0, 1
            U: obj.id + ":" + obj.subsId, // id
            R: obj.count, // epCount
            G: obj.goon, // goon
            A: obj.totalEpisodes,
            P: lastPubDatetime,
            F: isShort ? SUBJECT_PLATFORM_DEFAULT : obj.platform,
            B: Boolean(obj.nsfw)
        };
    });
}

/**
 * 获取当前季度的全量番剧放送日历数据
 * @param {UserInfo} [userInfo] - 用户信息
 * @returns {Promise<Array<import('#types/animeTypes.d.ts').AnimeCalendarItem>>}
 */
export async function getAnimeCalendar(userInfo) {
    const season = getCurSeason();
    const { rows, data } = await subjectsRep.selectVisibleBySeason(season.join('-'));
    return rows > 0 ? handleCalendar(data, userInfo) : [];
}

/**
 * 复合条件检索番剧数据列表（支持分页与日历模式判定）
 * @param {Object} body - 搜索参数
 * @param {number} [body.pageNum] - 页码
 * @param {number} [body.pageSize] - 单页条数
 * @param {number} [body.viewMode] - 视图模式 (0: 卡片分页模式, 其他: 全量日历模式)
 * @param {Record<string, any>} [body.filters] - 额外过滤条件
 * @param {UserInfo} [userInfo] - 当前登录用户信息
 * @returns {Promise<{ record: Array<any>, total: number, pageNum?: number, pageSize?: number, calendarable: boolean }>}
 */
export async function searchAnime(body, userInfo) {
    const { pageNum, pageSize, viewMode, ...filters } = body;
    const includeNsfw = Boolean(userInfo);
    const total = await subjectsRep.selectVisibleByFiltersCount(filters, includeNsfw);
    const calendarable = total <= 100;
    const cardMode = viewMode === 0;
    const queryPageNum = cardMode ? pageNum : undefined;
    const queryPageSize = cardMode ? pageSize : undefined;
    const { rows, data } = await subjectsRep.selectVisibleByFilters(filters, includeNsfw, queryPageNum, queryPageSize);
    const record = rows > 0 ? handleCalendar(data, userInfo) : [];
    return { record, total, pageNum: queryPageNum, pageSize: queryPageSize, calendarable };
}

/**
 * 根据番剧 ID 获取前台展示用的完整番剧详情（含别名、Staff、角色声优、RSS 抓取结果与已入库剧集）
 * @param {number} id - 番剧 ID
 * @param {UserInfo} [userInfo] - 当前登录用户信息 (用于加载已入库剧集)
 * @returns {Promise<any>}
 */
export async function getAnimeInformation(id, userInfo) {
    const subject = await subjectsRep.selectOneByIdForView(id);
    subject || __throwMessage('Anime not exists.');
    const subjectView = handleSubjectView(subject);
    const subsId = subject.subsId;
    const results = await getRssResultsByRssSubscribeId(subsId, userInfo);
    let episodes = undefined;
    if (userInfo) {
        episodes = await getRssEpisodesByRssSubscribeId(subsId);
    }
    if (__isNotEmptyArray(episodes)) {
        episodes = episodes.map(ep => ({ id: ep.id, episode: ep.episode, status: ep.status }))
            .toSorted((a, b) => a.episode - b.episode);
    }
    return {
        ...subjectView,
        fin: Boolean(subject.fin),
        results,
        episodes
    };
}

/**
 * 根据订阅 ID 查询关联的 RSS 抓取结果及下载任务关联状态
 * @param {number|string} rssSubsId - 订阅 ID
 * @param {UserInfo} [userInfo] - 用户信息
 * @returns {Promise<Array<any>>}
 */
async function getRssResultsByRssSubscribeId(rssSubsId, userInfo) {
    const results = [];
    const { data } = await rssResultRep.selectRssResultsByPid(rssSubsId, true);
    const tasks = [];
    if (userInfo) {
        const taskRes = await rssTaskRep.selectBySubsId(rssSubsId);
        taskRes.rows && tasks.push(...taskRes.data);
    }
    for (const item of data) {
        const { tracker, hide, pid, sort, ...result } = item;
        const trackers = await rssTrackerRep.selectHostsByIds((item.tracker ?? '').split(','));
        const torrent = [item.torrent, trackers.join('&tr=')].join('&tr=');
        result.torrent = 'magnet:?xt=urn:btih:' + torrent;
        const task = tasks.find(t => t.rssResultId === item.id);
        task && (result.taskId = task.id);
        results.push(result);
    }
    return results;
}

/**
 * 根据订阅 ID 获取已成功解析入库的剧集列表
 * @param {number|string} rssSubsId - 订阅 ID
 * @returns {Promise<Array<any>>}
 */
async function getRssEpisodesByRssSubscribeId(rssSubsId) {
    return rssEpisodeRep.selectBySubsId(rssSubsId).then(({ data }) => data);
}

/**
 * 获取当前登录用户收藏的番剧列表（日历紧凑视图）
 * @param {UserInfo} userInfo - 用户信息
 * @returns {Promise<Array<import('#types/animeTypes.d.ts').AnimeCalendarItem>>}
 */
export async function getUserFavoitesAnime(userInfo) {
    userInfo || __throwMessage("Permission denied.", -401, 401);
    const uid = userInfo.id;
    const rssFavorites = await filterUserRssFavoritesWithUid(uid);
    if (__isEmptyArray(rssFavorites)) return [];
    const subsIds = rssFavorites.map(o => o.rssSubscribeId);
    const { data: subjects } = await subjectsRep.selectVisibleBySubsIds(subsIds);
    const subjectMap = new Map();
    for (const subsId of subsIds) {
        const index = subjects.findIndex(s => s.subsId === subsId);
        if (index > -1) {
            subjectMap.set(subsId, ...subjects.splice(index, 1));
        }
    }
    const results = Array.from(subjectMap.values());
    return handleCalendar(results, userInfo);
}