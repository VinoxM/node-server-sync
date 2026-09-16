import { saveTrackers, multiExpandTorrentTracker, expandTorrentTracker, getTrackersMapping } from "#modules/anime/service/rss/rssTrackerService.js";
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
 * @returns {Promise<void>}
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

/**
 * 根据订阅 ID 查询所有抓取条目（拼接完整 Magnet 链接）
 * @param {number|string} subsId - 订阅 ID
 * @returns {Promise<Array<any>>}
 */
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

/**
 * 删除单条 RSS 抓取结果
 * @param {number|string} id - 抓取结果主键 ID
 * @returns {Promise<void>}
 */
export async function deleteOneResult(id) {
    const { rows } = await rssResultRep.deleteOneById(id);
    rows || __throwMessage('Delete rss result failed. Cause: not exists.');
}

/**
 * 删除指定订阅下的所有抓取结果
 * @param {number|string} subsId - 订阅 ID
 * @returns {Promise<{ rows: number }>}
 */
export async function deleteAllSubscribeResults(subsId) {
    return rssResultRep.deleteByPid(subsId);
}

/**
 * 伪删除/恢复（隐藏）单条 RSS 抓取结果
 * @param {number|string} id - 抓取结果 ID
 * @param {number} hide - 隐藏状态 (0: 否, 1: 是)
 * @returns {Promise<void>}
 */
export async function hideOneResult(id, hide) {
    const { rows } = await rssResultRep.fakeDeleteOneById(id, hide);
    rows || __throwMessage('Hide rss result failed. Cause: not exists.');
}

/**
 * 修改单条 RSS 抓取条目信息
 * @param {Object} result - 抓取条目数据
 * @returns {Promise<void>}
 */
export async function editOneResult(result) {
    const trackers = expandTorrentTracker(result);
    const trackerArr = await saveTrackers(trackers);
    handleRssResultProperties(result, { trackerArr });
    const { rows } = await rssResultRep.updateOne(result);
    rows || __throwMessage('Edit rss result failed.');
}

/**
 * 格式化 RSS 抓取结果条目的属性（生成自增 ID、关联 Tracker ID、提取集数及排序序号）
 * @param {Object} rssResult - 抓取条目
 * @param {Object} options - 选项
 * @param {number} [options.rssResultMaxId=-1] - 当前最大主键 ID
 * @param {number} [options.incr=0] - 增量偏移量
 * @param {Array<{ id: number, host: string }>} [options.trackerArr=null] - Tracker 列表
 */
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

/**
 * 为条目赋予连续主键 ID
 * @param {Object} rssResult
 * @param {number} rssResultMaxId
 * @param {number} incr
 */
function handleRssResultId(rssResult, rssResultMaxId, incr) {
    rssResult.id = incr + rssResultMaxId + 1;
}

/**
 * 将 Tracker Host 匹配转换为逗号分隔的 Tracker ID 字符串
 * @param {Object} rssResult
 * @param {Array<{ id: number, host: string }>} trackerArr
 */
function handleRssResultTrackers(rssResult, trackerArr) {
    const trs = rssResult.trackers;
    if (trs) {
        rssResult.tracker = trackerArr.filter(tr => trs.indexOf(tr.host) > -1).map(tr => tr.id).join(',');
    }
}

/**
 * 解析并回填标题中的集数
 * @param {Object} rssResult
 */
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

/**
 * 计算用于列表排序的序号
 * @param {Object} rssResult
 */
function handleRssResultSort(rssResult) {
    if (!rssResult.hasOwnProperty('sort')) {
        rssResult.sort = 0;
        if (rssResult.hasOwnProperty('episode')) {
            const episode = rssResult.episode + '';
            let sort = episode.split('-')[0];
            if (Number(sort) > 0) {
                rssResult.sort = Number(sort);
            }
        }
    }
}