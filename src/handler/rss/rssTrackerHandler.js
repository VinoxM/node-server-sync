import rssTrackerRep from "../../repository/rss/rssTrackerRep.js";

const { selectAll, selectMaxId, insertManyWithId } = rssTrackerRep;

const torrentHandler = (rssResult) => {
    const trackers = [];
    if (rssResult && rssResult.hasOwnProperty('torrent')) {
        const torrent = "" + rssResult.torrent;
        if (torrent.startsWith("magnet:?xt=urn:btih:")) {
            const i = torrent.indexOf("&");
            if (i > -1) {
                rssResult.torrent = torrent.substring(20, i);
                torrent.substring(i).split("&").forEach(tracker => {
                    if (tracker.startsWith("tr=")) {
                        trackers.push(tracker.replace("tr=", ""));
                    }
                })
                rssResult.trackers = trackers;
            } else {
                rssResult.torrent = torrent.substring(20);
            }
        }
    }
    return trackers;
}

const torrentsHandler = (rssResults) => {
    const trackers = new Set();
    if (isNotEmptyArray(rssResults)) {
        for (let i = 0; i < rssResults.length; i++) {
            const rssResult = rssResults[i];
            torrentHandler(rssResult).forEach(tr => trackers.add(tr));
        }
    }
    return Array.from(trackers);
}

const saveTrackers = async (trackers, transactionDB) => {
    let { data: trackerArr } = await selectAll(false);
    // trackerArr = trackerArr.map(obj => obj.host);
    const include = trackers.filter(t => trackerArr.some(obj => obj.host === t));
    if (include.length > 0) {
        const maxId = await selectMaxId();
        const saveArr = [];
        for (let i = 0; i < include.length; i++) {
            const obj = {
                id: maxId + i + 1,
                host: include[i]
            }
            saveArr.push(obj)
        }
        if (saveArr.length > 0) {
            await insertManyWithId(saveArr, transactionDB);
            return selectAll(false).then(res => res.data);
        }
    }
    return trackerArr;
}

const concatTrackers = (torrentStr, trackerStr, trackers) => {
    return 'magnet:?xt=urn:btih:' + [torrentStr, (trackerStr ?? '').split(',').map(t => t in trackers ? trackers[t] : '').join('&tr=')].join('&tr=');
}

export {
    torrentHandler,
    torrentsHandler,
    saveTrackers,
    concatTrackers
}