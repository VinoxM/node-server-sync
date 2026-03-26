import { saveTrackers, multiExpandTorrentTracker, expandTorrentTracker } from "./rssTrackerService.js";
import { AsyncExecutor } from "../../../core/infra/asyncExecutor.js";
import { GetterContextSubscribe } from '../../../core/context/subscribe.js';
import rssResultRep from "../repository/rssResultRep.js";

const episodeMatches = new GetterContextSubscribe('episodeMatches', () => __env.get('rss.episodeMatches', []))
export function getEpisodeMatches() {
    return episodeMatches.getValue() ?? []
}

export async function addOneResult(result) {
    const trackers = expandTorrentTracker(result);
    const trackerArr = await saveTrackers(trackers);
    const rssResultMaxId = await rssResultRep.selectMaxId();
    handleRssResultProperties(result, { trackerArr, rssResultMaxId });
    return rssResultRep.insertOne(result);
}

export async function addManyResult(resultArr) {
    if (__isEmptyArray(resultArr)) return Promise.resolve(0);
    const trackers = multiExpandTorrentTracker(resultArr);
    const trackerArr = await saveTrackers(trackers);
    const rssResultMaxId = await rssResultRep.selectMaxId();
    for (let i = 0; i < resultArr.length; i++) {
        handleRssResultProperties(resultArr[i], { trackerArr, rssResultMaxId, incr: i });
    }
    return new Promise(resolve => {
        let success = 0;
        const executor = new AsyncExecutor(() => {
            resolve(success);
        }, null);
        const everyHandleCount = 100;
        for (let i = 0; i < resultArr.length; i += everyHandleCount) {
            executor.submit((resolve) => {
                const arr = resultArr.slice(i, Math.min(i + everyHandleCount, resultArr.length))
                rssResultRep.insertMany(arr)
                    .then(({ rows }) => {
                        success += rows;
                        resolve();
                    })
                    .catch(ex => {
                        __log.error(`Insert Rss Results error. Cause: ${ex.message}`);
                        resolve();
                    })
            })
        }
        executor.start();
    });
}

export async function editOneResult(result) {
    const trackers = torrentHandler(result);
    const trackerArr = await saveTrackers(trackers);
    handleRssResultProperties(result, { trackerArr });
    return rssResultRep.updateOne(result);
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
        })
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