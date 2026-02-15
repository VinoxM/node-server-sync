import { torrentsHandler, saveTrackers, torrentHandler } from "./rssTrackerHandler.js";
import rssResultRep from "../../repository/rss/rssResultRep.js";
import { Executor } from "../../common/executor.js";
import { ContextSubcribe } from '../../context/subscribe.js';

const { selectMaxId: selectRssResultMaxId, insertMany: insertManyResult, insertOne, updateOne } = rssResultRep

let episodeMatches = []
let episodeMatchesSubscription = null
const getEpisodeMatches = () => {
    if (episodeMatchesSubscription === null) {
        episodeMatchesSubscription = new ContextSubcribe('episodeMatches', () => {
            episodeMatches = __env.get('rss.episodeMatches', [])
        })
        episodeMatchesSubscription.onRefresh()
    }
    return episodeMatches || []
}

const addOneResult = async (result) => {
    const trackers = torrentHandler(result);
    const trackerArr = await saveTrackers(trackers);
    const rssResultMaxId = await selectRssResultMaxId();
    handleRssResultProperties(result, { trackerArr, rssResultMaxId });
    return insertOne(result);
}

const addManyResult = async (resultArr) => {
    if (isEmptyArray(resultArr)) return Promise.resolve(0);
    const trackers = torrentsHandler(resultArr);
    const trackerArr = await saveTrackers(trackers);
    const rssResultMaxId = await selectRssResultMaxId();
    for (let i = 0; i < resultArr.length; i++) {
        handleRssResultProperties(resultArr[i], { trackerArr, rssResultMaxId, incr: i });
    }
    return new Promise(resolve => {
        let success = 0;
        const executor = new Executor(() => {
            resolve(success);
        }, null);
        const everyHandleCount = 100;
        for (let i = 0; i < resultArr.length; i += everyHandleCount) {
            executor.submit((resolve) => {
                const arr = resultArr.slice(i, Math.min(i + everyHandleCount, resultArr.length))
                insertManyResult(arr)
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

const editOneResult = async (result) => {
    const trackers = torrentHandler(result);
    const trackerArr = await saveTrackers(trackers);
    handleRssResultProperties(result, { trackerArr });
    return updateOne(result);
}

const handleRssResultProperties = (rssResult, { rssResultMaxId = -1, incr = 0, trackerArr = null }) => {
    if (rssResultMaxId !== -1) {
        handleRssResultId(rssResult, rssResultMaxId, incr);
    }
    if (trackerArr !== null) {
        handleRssResultTrackers(rssResult, trackerArr);
    }
    handleRssResultEpisode(rssResult);
    handleRssResultSort(rssResult);
}

const handleRssResultId = (rssResult, rssResultMaxId, incr) => {
    rssResult.id = incr + rssResultMaxId + 1;
}

const handleRssResultTrackers = (rssResult, trackerArr) => {
    const trs = rssResult.trackers;
    if (trs) {
        rssResult.tracker = trackerArr.filter(tr => trs.indexOf(tr.host) > -1).map(tr => tr.id).join(',');
    }
}

const handleRssResultEpisode = (rssResult) => {
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

const handleRssResultSort = (rssResult) => {
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

export {
    addManyResult,
    addOneResult,
    editOneResult,
    getEpisodeMatches
}