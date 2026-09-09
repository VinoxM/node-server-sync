import { getCurSeason } from "#utils/dateUtil.js";
import rssEpisodeRep from "#modules/anime/repository/rss/rssEpisodeRep.js";
import { SUBJECT_NSFW_VALUE, SUBJECT_PLATFORM_DEFAULT, SUBJECT_PLATFORM_IS_SHORT } from "#modules/anime/constants/subjectConstant.js";
import rssResultRep from "#modules/anime/repository/rss/rssResultRep.js";
import rssTrackerRep from "#modules/anime/repository/rss/rssTrackerRep.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import { handleSubjectView } from "./subject/subjectService.js";

function handleSearch(data, userInfo) {
    let list = userInfo ? data : data.filter(o => o.nsfw === SUBJECT_NSFW_VALUE.NO);
    let now = new Date();
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
        return {
            Z: obj.nameCN, // name
            J: obj.name, // nameJP
            D: startDate + updateTime + date.getDay(), // startDate. ep: '2024010210000'
            C: obj.cover, // cover
            T: type, // type. isShort(0/1) concat isWeb(0/1)
            S: status, // status. enum: 0-not start/1-broadcasting/2-fin
            E: obj.latestEp, // lastEp
            N: obj.hasNew, // hasNew. enum: 0, 1
            U: obj.id + ":" + obj.subsId, // id
            R: obj.count, // epCount
            G: obj.goon, // goon
            A: obj.totalEpisodes,
        };
    });
}

/**
 * 获取当前季度的全量番剧放送日历数据
 * @returns {Promise<Array<import('#types/animeTypes.d.ts').AnimeCalendarItem>>}
 */
export async function getAnimeCalendar(userInfo) {
    const season = getCurSeason();
    const { rows, data } = await subjectsRep.selectVisibleBySeason(season.join('-'));
    return rows > 0 ? handleSearch(data, userInfo) : [];
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
    const results = await getRssResultsByRssSubscribeId(subsId);
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
        results,
        episodes
    };
}

async function getRssResultsByRssSubscribeId(rssSubsId) {
    const results = [];
    const { data } = await rssResultRep.selectRssResultsByPid(rssSubsId);
    for (const item of data) {
        const { tracker, ...result } = item;
        const trackers = await rssTrackerRep.selectHostsByIds((item.tracker ?? '').split(','));
        const torrent = [item.torrent, trackers.join('&tr=')].join('&tr=');
        result.torrent = 'magnet:?xt=urn:btih:' + torrent;
        results.push(result);
    }
    return results;
}

async function getRssEpisodesByRssSubscribeId(rssSubsId) {
    return rssEpisodeRep.selectBySubsId(rssSubsId).then(({ data }) => data);
}
