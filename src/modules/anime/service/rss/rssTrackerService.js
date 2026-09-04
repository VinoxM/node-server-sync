import rssTrackerRep from "#modules/anime/repository/rss/rssTrackerRep.js";

/**
 * 从磁力链接中提取出纯哈希值
 * @param {string} torrent - 磁力链接字符串
 * @returns {string|null} 提取出的哈希值
 */
export function takeOutTorrentHash(torrent) {
    let result = null;
    if (torrent.startsWith("magnet:?xt=urn:btih:")) {
        result = torrent.substring(20);
        const i = result.indexOf("&");
        if (i > -1) {
            result = result.substring(0, i);
        }
    }
    return result;
}

/**
 * 展开并提取单个磁力链接中的所有 Tracker Host
 * @param {Object} rssResult - 抓取结果条目对象
 * @returns {string[]} 提取出的 Tracker Host 列表
 */
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
                });
                rssResult.trackers = trackers;
            } else {
                rssResult.torrent = torrent.substring(20);
            }
        }
    }
    return trackers;
}

/**
 * 批量提取多条 RSS 结果中的全部唯一 Tracker Host 列表
 * @param {Array<any>} rssResults - 抓取结果列表
 * @returns {string[]} 去重后的 Tracker Host 数组
 */
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

/**
 * 将新的 Tracker 服务器落库并返回全量 Tracker 列表
 * @param {string[]} trackers - 待保存的 Tracker 列表
 * @param {TransactionDB} [transactionDB] - 可选的事务句柄
 * @returns {Promise<Array<{ id: number, host: string }>>}
 */
export async function saveTrackers(trackers, transactionDB) {
    let { data: trackerArr } = await rssTrackerRep.selectAll(false);
    const excludes = trackers.filter(t => !trackerArr.some(obj => obj.host === t));
    if (excludes.length > 0) {
        const maxId = await rssTrackerRep.selectMaxId();
        const saveArr = [];
        for (let i = 0; i < excludes.length; i++) {
            const obj = {
                id: maxId + i + 1,
                host: excludes[i]
            };
            saveArr.push(obj);
        }
        if (saveArr.length > 0) {
            await rssTrackerRep.insertManyWithId(saveArr, transactionDB);
            return rssTrackerRep.selectAll(false).then(res => res.data);
        }
    }
    return trackerArr;
}

/**
 * 根据数据库中的 Tracker 映射拼接完整的 Magnet 链接
 * @param {string} torrentHash - 种子 Hash
 * @param {string} trackerStr - 逗号分隔的 Tracker ID 字符串
 * @returns {Promise<string>}
 */
export async function concatTracker(torrentHash, trackerStr) {
    const trackers = await rssTrackerRep.selectAll();
    return concatTrackers(torrentHash, trackerStr, trackers);
}

/**
 * 将种子 Hash 和 Tracker ID 列表格式化为标准 Magnet URI
 * @param {string} torrentStr - 种子 Hash
 * @param {string} trackerStr - 逗号分隔的 Tracker ID 字符串
 * @param {Record<string, string>|Array<{ id: number, host: string }>} trackers - Tracker 映射字典
 * @returns {string} 完整的 Magnet URI
 */
export function concatTrackers(torrentStr, trackerStr, trackers) {
    return 'magnet:?xt=urn:btih:' + [torrentStr, (trackerStr ?? '').split(',').map(t => t in trackers ? trackers[t] : '').join('&tr=')].join('&tr=');
}