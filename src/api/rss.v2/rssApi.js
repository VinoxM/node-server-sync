import apiMethodConst from '../../constraints/apiMethodConst.js';
import apiQueryConst from '../../constraints/apiQueryConst.js';
import rssRep from '../../repository/rss/rssRep.js';
import rssLinkRep from '../../repository/rss/rssLinkRep.js';
import rssCopyrightRep from '../../repository/rss/rssCopyrightRep.js';
import rssTrackerRep from '../../repository/rss/rssTrackerRep.js';
import { checkQueryKeyNotBlank, checkQueryKeyMatchIfPresent as checkQueryKeyMatch } from '../../common/apiPreCheck.js';

const { GET } = apiMethodConst
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
        ignoreOutput: true,
        callback: () => {
            return rssRep.selectRssSubscribeSeasonsV2().then(({ data }) => Object.fromEntries(data.map(d => [d.season, d.count])));
        }
    },
    "/getSearch": {
        method: GET,
        ignoreOutput: true,
        preCheck: (req) => {
            try {
                checkQueryKeyNotBlank(req, NAME);
            } catch (error) {
                checkQueryKeyNotBlank(req, SEASON);
            }
            checkQueryKeyMatch(req, SEASON, ['[0-9]{4}-(01|04|07|10)']);
        },
        callback: (req) => {
            return rssRep.selectRssSubscribeForSearchV2(req.query.season, req.query.name).then(({ data }) => handleSearch(data));
        }
    },
    "/getOne.detail": {
        method: GET,
        ignoreOutput: true,
        preCheck: (req) => checkQueryKeyNotBlank(req, ID),
        callback: async (req) => {
            const { id, needTr = false } = req.query;
            const subscribe = await rssRep.selectOneById(id);
            if (subscribe === null) {
                throwMessage('No such anime found.');
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
            return rssRep.selectRssResultsByPidV2(id).then(({ data }) => {
                const results = Array.from(data).map(item => {
                    const torrent = needTr ? [item.torrent, (item.tracker ?? '').split(',').map(t => t in trackers ? trackers[t] : '').join('&tr=')].join('&tr=') : item.torrent;
                    const { tracker, ...result } = item;
                    result.torrent = 'magnet:?xt=urn:btih:' + torrent;
                    return result;
                });
                subscribe.results = results;
                subscribe.link = link;
                subscribe.copyright = copyright;
                return subscribe;
            });
        }
    },
    '/getOneForEdit': {
        method: GET,
        ignoreOutput: true,
        needSecret: () => "mAou5820.subscribe",
        preCheck: (req) => checkQueryKeyNotBlank(req, ID),
        callback: async (req) => {
            const { id } = req.query;
            const subscribe = await rssRep.selectOneForEdit(id);
            if (subscribe === null) {
                throwMessage('No such anime found.');
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
        ignoreOutput: true,
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
    }
}