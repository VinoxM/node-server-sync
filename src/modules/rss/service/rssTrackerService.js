import rssTrackerRep from "../repository/rssTrackerRep.js";

export function takeOutTorrentHash(torrent) {
    let result = null
    if (torrent.startsWith("magnet:?xt=urn:btih:")) {
        result = torrent.substring(20, i);
        const i = result.indexOf("&");
        if (i > -1) {
            result = result.substring(0, i)
        }
    }
    return result
}

export function expandTorrentTracker(rssResult) {
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

export function multiExpandTorrentTracker(rssResults) {
    const trackers = new Set();
    if (__isNotEmptyArray(rssResults)) {
        for (let i = 0; i < rssResults.length; i++) {
            const rssResult = rssResults[i];
            expandTorrentTracker(rssResult).forEach(tr => trackers.add(tr));
        }
    }
    return Array.from(trackers);
}

export async function saveTrackers(trackers, transactionDB) {
    let { data: trackerArr } = await rssTrackerRep.selectAll(false);
    const include = trackers.filter(t => trackerArr.some(obj => obj.host === t));
    if (include.length > 0) {
        const maxId = await rssTrackerRep.selectMaxId();
        const saveArr = [];
        for (let i = 0; i < include.length; i++) {
            const obj = {
                id: maxId + i + 1,
                host: include[i]
            }
            saveArr.push(obj)
        }
        if (saveArr.length > 0) {
            await rssTrackerRep.insertManyWithId(saveArr, transactionDB);
            return rssTrackerRep.selectAll(false).then(res => res.data);
        }
    }
    return trackerArr;
}

export async function concatTracker(torrentHash, trackerStr) {
    const trackers = await rssTrackerRep.selectAll()
    return concatTrackers(torrentHash, trackerStr, trackers)
}

export function concatTrackers(torrentStr, trackerStr, trackers) {
    return 'magnet:?xt=urn:btih:' + [torrentStr, (trackerStr ?? '').split(',').map(t => t in trackers ? trackers[t] : '').join('&tr=')].join('&tr=');
}