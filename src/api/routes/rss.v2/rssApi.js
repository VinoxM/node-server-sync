import apiMethodConst from "../../../common/constants/apiMethodConst.js";
import apiQueryConst from "../../../common/constants/apiQueryConst.js";
import { checkBodyKeyMatch, checkBodyKeysNotBlank, checkQueryKeyMatchIfPresent, checkQueryKeyNotBlank } from "../../../common/utils/preCheckUtil.js";
import { decodeAuthorization } from "../../../modules/authorization/authorizationService.js";
import { generateMinioSourceSafely } from "../../../modules/media/service/mediaMinioService.js";
import rssCopyrightRep from "../../../modules/rss/repository/rssCopyrightRep.js";
import rssEpisodeRep from "../../../modules/rss/repository/rssEpisodeRep.js";
import rssFontsRep from "../../../modules/rss/repository/rssFontsRep.js";
import rssLinkRep from "../../../modules/rss/repository/rssLinkRep.js";
import rssRep from "../../../modules/rss/repository/rssRep.js";
import rssSubscribeRep from "../../../modules/rss/repository/rssSubscribeRep.js";
import rssSubtitleRep from "../../../modules/rss/repository/rssSubtitleRep.js";
import rssTaskRep from "../../../modules/rss/repository/rssTaskRep.js";
import rssTrackerRep from "../../../modules/rss/repository/rssTrackerRep.js";

const { GET, POST } = apiMethodConst
const { SEASON, ID, NAME } = apiQueryConst

const handleSearch = (data) => {
    let list = Array.from(data);
    let now = new Date();
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }
    return list.map(obj => {
        const { startTime } = obj;
        let date = new Date(startTime);
        let startDate = `${date.getFullYear()}${(date.getMonth() + 1 + '').padStart(2, '0')}${(date.getDate() + '').padStart(2, '0')}`;
        let hours = date.getHours();
        let minutes = date.getMinutes();
        if (hours >= 0 && hours < 6) {
            date.setDate(date.getDate() - 1);
            hours += 24;
        }
        let updateTime = `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
        let type = `${obj.isShort}${obj.animeType === 1 ? 0 : 1}`;
        let status = now.getTime() - date.getTime() < 0 ? 0 : (obj.fin === 'N' ? 1 : 2);
        return {
            Z: obj.name, // name
            J: obj.nameJP, // nameJP
            D: startDate + updateTime + date.getDay(), // startDate. ep: '2024010210000'
            C: obj.cover, // cover
            T: type, // type. isShort(0/1) concat isWeb(0/1)
            S: status, // status. enum: 0-not start/1-broadcasting/2-fin
            E: obj.latestEp, // lastEp
            N: obj.hasNew, // hasNew. enum: 0, 1
            U: obj.id, // id
            R: obj.count, // epCount
            G: obj.goon // goon
        }
    })
}

export default {
    basePath: "/rss/v2",
    "/getSeason": {
        method: GET,
        callback: () => {
            return rssRep.selectRssSubscribeSeasonsV2().then(({ data }) => Object.fromEntries(data.map(d => [d.season, d.count])));
        }
    },
    "/getSearch": {
        method: GET,
        preCheck: (req) => {
            try {
                checkQueryKeyNotBlank(req, NAME);
            } catch (error) {
                checkQueryKeyNotBlank(req, SEASON);
            }
            checkQueryKeyMatchIfPresent(req, SEASON, ['[0-9]{4}-(01|04|07|10)']);
        },
        callback: (req) => {
            return rssRep.selectRssSubscribeForSearchV2(req.query.season, req.query.name).then(({ data }) => handleSearch(data));
        }
    },
    "/getOne.detail": {
        method: GET,
        preCheck: (req) => checkQueryKeyNotBlank(req, ID),
        callback: async (req) => {
            const { id, needTr = false } = req.query;
            const subscribe = await rssRep.selectOneById(id);
            if (subscribe === null) {
                __throwMessage('No such anime found.');
            }
            let trackers = []
            if (needTr) {
                trackers = await rssTrackerRep.selectAll(false).then(({ data }) => {
                    const result = {};
                    Array.from(data).forEach(item => {
                        result[item.id] = item.host;
                    })
                    return result;
                });
            }
            const link = await rssLinkRep.selectByPidV2(id).then(({ data }) => data);
            const copyright = await rssCopyrightRep.selectByPidV2(id).then(({ data }) => data);
            const userInfo = await decodeAuthorization(req)
            const isAuthed = !!userInfo
            let episode = null
            let tasks = null
            if (isAuthed) {
                episode = await rssEpisodeRep.selectBySubsId(id).then(({ data }) => data);
                tasks = await rssTaskRep.selectBySubsId(id).then(({ data }) => data);
            }
            return rssRep.selectRssResultsByPidV2(id).then(({ data }) => {
                const tasksArr = Array.from(tasks ?? [])
                subscribe.results = Array.from(data).map(item => {
                    const torrent = needTr ? [item.torrent, (item.tracker ?? '').split(',').map(t => t in trackers ? trackers[t] : '').join('&tr=')].join('&tr=') : item.torrent;
                    const { tracker, ...result } = item;
                    result.torrent = 'magnet:?xt=urn:btih:' + torrent;
                    if (isAuthed) {
                        const task = tasksArr.find(o => o.rssResultId === item.id)
                        result.taskId = task?.id
                        result.taskStatus = task?.status
                    }
                    return result;
                });
                subscribe.link = link;
                subscribe.copyright = copyright;
                if (isAuthed) {
                    subscribe.episode = episode;
                }
                return subscribe;
            });
        }
    },
    '/getOneForEdit': {
        method: GET,
        needAuth: true,
        needSecret: () => "mAou5820.subscribe",
        preCheck: (req) => checkQueryKeyNotBlank(req, ID),
        callback: async (req) => {
            const { id } = req.query;
            const subscribe = await rssRep.selectOneForEdit(id);
            if (subscribe === null) {
                __throwMessage('No such anime found.');
            }
            const link = await rssLinkRep.selectByPid(id).then(({ data }) => data);
            const copyright = await rssCopyrightRep.selectByPid(id).then(({ data }) => data);
            subscribe.link = link;
            subscribe.copyright = copyright;
            return subscribe;
        }
    },
    '/getOne.results': {
        method: GET,
        needAuth: true,
        needSecret: () => "mAou5820.subscribe",
        preCheck: (req) => checkQueryKeyNotBlank(req, ID),
        callback: async (req) => {
            const { id } = req.query;
            const trackers = await rssTrackerRep.selectAll(true).then(({ data }) => {
                const result = {};
                Array.from(data).forEach(item => {
                    result[item.id] = item.host;
                })
                return result;
            });
            return rssRep.selectRssResultsByPidForEdit(id).then(({ data }) => {
                return Array.from(data).map(item => {
                    const torrent = [item.torrent, (item.tracker ?? '').split(',').map(t => t in trackers ? trackers[t] : '').join('&tr=')].join('&tr=');
                    const { tracker, ...result } = item;
                    result.torrent = 'magnet:?xt=urn:btih:' + torrent;
                    return result;
                });
            });
        }
    },
    '/getEpisodeExistsSubscriptions': {
        method: POST,
        needAuth: true,
        needSecret: () => "mAou5820.subscribe",
        callback: async req => {
            const { season, title, pageNum = 1, pageSize = 20 } = req.body
            const record = await rssSubscribeRep.selectEpisodesExistsSubsForSearch(season, title, pageSize, pageNum).then(({ data }) => data)
            const total = await rssSubscribeRep.selectEpisodesExistsSubsForCount(season, title)
            return { record, total, pageNum, pageSize }
        }
    },
    '/getRssCardFailedViews': {
        method: GET,
        needAuth: true,
        needSecret: () => "mAou5820.subscribe",
        callback: async () => {
            const episodeFailedCount = await rssEpisodeRep.selectFailedCount();
            const subtitleFailedCount = await rssSubtitleRep.selectFailedCount();
            return {
                episodeFailedCount,
                subtitleFailedCount
            }
        }
    },
    "/getRssEpisodeSource": {
        method: POST,
        needSecret: () => "mAou5820.subscribe",
        preCheck: (req) => checkBodyKeysNotBlank(req, ['rssSubsId', 'episode']),
        callback: async req => {
            const { rssSubsId, episode } = req.body
            const sourcesData = await rssEpisodeRep.selectSourceBySubsIdAndEpisode(rssSubsId, episode)
            const episodeData = sourcesData?.data?.find(r => r.episode === episode)
            const result = { url: null, subtitles: [], unsupportedFonts: [], title: null, sources: sourcesData?.data.map(d => ({ episode: d.episode, title: `${d.title} - ${d.episode}` })) }
            if (!episodeData?.minioLink) return result
            result.url = generateMinioSourceSafely(episodeData.minioLink)
            result.title = __isBlank(episodeData.title) ? null : `${episodeData.title} - ${episode}`
            const { data, rows } = await rssSubtitleRep.selectBySubsIdAndEpisode(rssSubsId, episode)
            if (rows === 0) return result
            const unsupportedFontSet = new Set()
            for (const subtitle of data) {
                const { minioLink, fonts, title } = subtitle
                const obj = { url: generateMinioSourceSafely(minioLink), fonts, title }
                if (__isNotBlank(fonts)) {
                    const fontNameArr = fonts.split(',')
                    const fontArr = await rssFontsRep.selectByTitles(fontNameArr)
                    fontNameArr.forEach(f => fontArr.some(_f => _f.title === f) || unsupportedFontSet.add(f))
                    obj.fonts = fontArr.map(f => generateMinioSourceSafely(f.minioLink))
                }
                result.subtitles.push(obj)
            }
            result.unsupportedFonts = Array.from(unsupportedFontSet)
            return result;
        }
    }
}