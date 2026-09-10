import { saveTrackers, multiExpandTorrentTracker, expandTorrentTracker, getTrackersMapping } from "./rssTrackerService.js";
import { GetterContextSubscribe } from '#core/context/subscribe.js';
import rssResultRep from "#modules/anime/repository/rss/rssResultRep.js";

const episodeMatches = new GetterContextSubscribe('episodeMatches', () => __env.get('rss.episodeMatches', []));

/**
 * 获取全局集数/话数正则匹配模板列表
 * @returns {string[]}
 */
export function getEpisodeMatches() {
    return episodeMatches.getValue() ?? [];
}

/**
 * 格式化并持久化一条 RSS 抓取条目
 * @param {Object} result - 抓取条目数据
 * @returns {Promise<ExecResult>}
 */
export async function addOneResult(result) {
    const trackers = expandTorrentTracker(result);
    const trackerArr = await saveTrackers(trackers);
    const rssResultMaxId = await rssResultRep.selectMaxId();
    handleRssResultProperties(result, { trackerArr, rssResultMaxId });
    const { rows } = await rssResultRep.insertOne(result);
    rows || __throwMessage('Add rss result failed. Cause: exists.');
}

/**
 * 批量格式化并持久化 RSS 抓取条目列表
 * @param {Array<any>} resultArr - 抓取条目列表
 * @returns {Promise<number>} 成功插入的条数
 */
export async function addManyResult(resultArr) {
    if (__isEmptyArray(resultArr)) return 0;
    const trackers = multiExpandTorrentTracker(resultArr);
    const trackerArr = await saveTrackers(trackers);
    const rssResultMaxId = await rssResultRep.selectMaxId();
    for (let i = 0; i < resultArr.length; i++) {
        handleRssResultProperties(resultArr[i], { trackerArr, rssResultMaxId, incr: i });
    }
    const { rows } = await rssResultRep.insertMany(resultArr);
    return rows;
}

export async function getResultsBySubsId(subsId) {
    const trackers = await getTrackersMapping();
    const { data } = await rssResultRep.selectRssResultsByPid(subsId);
    return data.map(item => {
        const torrent = [item.torrent, (item.tracker ?? '').split(',').map(t => t in trackers ? trackers[t] : '').join('&tr=')].join('&tr=');
        const { tracker, ...result } = item;
        result.torrent = 'magnet:?xt=urn:btih:' + torrent;
        return result;
    });
}

export async function deleteOneResult(id) {
    const { rows } = await rssResultRep.deleteOneById(id);
    rows || __throwMessage('Delete rss result failed. Cause: not exists.');
}

export async function deleteAllSubscribeResults(subsId) {
    return rssResultRep.deleteByPid(subsId);
}

export async function hideOneResult(id, hide) {
    const { rows } = await rssResultRep.fakeDeleteOneById(id, hide);
    rows || __throwMessage('Hide rss result failed. Cause: not exists.');
}

/**
 * 修改单条 RSS 抓取条目信息
 * @param {Object} result - 抓取条目数据
 * @returns {Promise<ExecResult>}
 */
export async function editOneResult(result) {
    const trackers = expandTorrentTracker(result);
    const trackerArr = await saveTrackers(trackers);
    handleRssResultProperties(result, { trackerArr });
    const { rows } = await rssResultRep.updateOne(result);
    rows || __throwMessage('Edit rss result failed.');
}

function handleRssResultProperties(rssResult, { rssResultMaxId = -1, incr = 0, trackerArr = null }) {
    if (rssResultMaxId !== -1) {
        handleRssResultId(rssResult, rssResultMaxId, incr);
    }
    if (trackerArr !== null) {
        handleRssResultTrackers(rssResult, trackerArr);
    }
    handleRssResultEpisode(rssResult);
    handleRssResultSort(rssResult);
}

function handleRssResultId(rssResult, rssResultMaxId, incr) {
    rssResult.id = incr + rssResultMaxId + 1;
}

function handleRssResultTrackers(rssResult, trackerArr) {
    const trs = rssResult.trackers;
    if (trs) {
        rssResult.tracker = trackerArr.filter(tr => trs.indexOf(tr.host) > -1).map(tr => tr.id).join(',');
    }
}

function handleRssResultEpisode(rssResult) {
    if (!rssResult.hasOwnProperty('episode') || rssResult.episode.trim() === '') {
        rssResult.episode = "-";
        const title = rssResult.title;
        getEpisodeMatches().some(match => {
            const exec = new RegExp(match, 'i').exec(title);
            if (exec !== null) {
                rssResult.episode = exec[1];
                return true;
            }
            return false;
        });
    }
}

function handleRssResultSort(rssResult) {
    if (!rssResult.hasOwnProperty('sort')) {
        rssResult.sort = 0;
        if (rssResult.hasOwnProperty('episode')) {
            const episode = rssResult.episode + '';
            let sort = episode.split('-')[0];
            if (sort > 0) {
                rssResult.sort = sort;
            }
        }
    }
}