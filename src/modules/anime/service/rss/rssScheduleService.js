import rssSubscribeRep from '#modules/anime/repository/rss/rssSubscribeRep.js';
import { AsyncExecutor } from '#core/infra/asyncExecutor.js';
import { addManyResult } from '#modules/anime/service/rss/rssResultService.js';
import { analysisRssSubscribe } from '#modules/anime/service/rss/rssSubscribeService.js';
import { concatTrackers, getTrackersMapping } from '#modules/anime/service/rss/rssTrackerService.js';
import rssResultRep from '#modules/anime/repository/rss/rssResultRep.js';
import { pushNotification } from '#api/sockets/notification.js';
import { pushRssSubscription } from '#api/sockets/rssSubscription.js';
import { addRssTasksFromFavorites } from '#modules/anime/service/rss/rssTaskService.js';
import { SUBSCRIBE_FIN_VALUE, SUBSCRIBE_GOON_VALUE } from '#modules/anime/constants/subjectConstant.js';
import { compareSeason, getCurSeason } from '#common/utils/dateUtil.js';

const rssUpdate = {
    value: false,
    locked: () => rssUpdate.value,
    tryLock: () => rssUpdate.locked() ? __throwMessage('Rss is updating!', -5) : (rssUpdate.value = true),
    release: () => rssUpdate.value = false
};

/**
 * 查询当前是否正在执行 RSS 订阅抓取更新
 * @returns {boolean}
 */
export function isRssUpdating() {
    return rssUpdate.locked();
}

/**
 * 获取待执行更新的有效订阅列表（过滤空 URL）
 * @param {number[]} [subsIds] - 订阅 ID 列表
 * @returns {Promise<Array<{ id: number, url: string, regex: string }>>}
 */
async function getUpdateRssSubscirbe(subsIds) {
    try {
        const { data } = await rssSubscribeRep.selectForSubscribeUpdate(subsIds);
        return data.filter(o => __isNotBlank(o.url));
    } catch (err) {
        __log.error(`[RSS Subscribe] Get rss subscribe list failed. Cause:`, err.message ?? err);
        return [];
    }
}

/**
 * 尝试抓取并解析单个订阅的 XML 内容
 * @param {{ id: number, url: string, regex: string }} obj - 订阅配置
 * @param {Array<any>} results - 结果收集容器
 * @returns {Promise<boolean>} 是否成功
 */
async function tryAnalysisRssSubscribe(obj, results) {
    try {
        const analysis = await analysisRssSubscribe(obj);
        results.push(...analysis);
        return true;
    } catch {
        return false;
    }
}

/**
 * 尝试批量持久化 RSS 抓取结果（开发环境下可跳过入库）
 * @param {Array<any>} rssResults - 抓取结果列表
 * @returns {Promise<number>} 插入条数
 */
async function tryAddManyResult(rssResults) {
    if (__env.isDev()) {
        __log.debug(`[RSS Subscribe] Dev environment, skipped the rssResults database insert.`);
        return rssResults.length;
    }
    return await addManyResult(rssResults);
}

/**
 * 触发全量或指定订阅列表的 RSS 抓取并解析更新
 * @param {number[]} [ids] - 可选的订阅 ID 数组（若为空则更新全部有效订阅）
 * @returns {Promise<{ handledCount: number, effectRows: number }>}
 */
export async function updateRssSubscribe(ids) {
    rssUpdate.tryLock();
    __log.debug("[RSS Subscribe] Update Rss Subscribe.");
    const toHandleData = await getUpdateRssSubscirbe(ids);
    if (toHandleData.length === 0) {
        return { handledCount: 0, effectRows: 0 };
    }
    return new Promise((resolve, reject) => {
        const rssResults = [];
        let failedCount = 0, handledCount = 0, effectRows = 0;
        const { parallelNum = 3, everyHandleCount = 30, handleDelay = 20 * 1000 } = __env.get("rss.subscribeHandler", {});
        const tasks = toHandleData.map(obj => async execResolve => {
            const successful = await tryAnalysisRssSubscribe(obj, rssResults);
            successful ? handledCount++ : failedCount++;
            execResolve();
        });
        const execComplete = async () => {
            const handled = handledCount + failedCount;
            if (handled < tasks.length) {
                __log.debug(`[RSS Subscribe] Analysis Rss Subscribe delay ${handleDelay}ms. Handled: ${handled}, failed: ${failedCount}.`);
                setTimeout(() => {
                    submitAndRun();
                }, handleDelay);
            } else {
                __log.debug(`[RSS Subscribe] Analysis Rss Subscribe complete. Total: ${tasks.length}, Error: ${failedCount}, Results: ${rssResults.length}`);
                if (rssResults.length > 0) {
                    const rows = await tryAddManyResult(rssResults);
                    rows > 0 && __log.info(`[RSS Subscribe] Update Rss Results complete. Rows: ${rows}`);
                    effectRows += rows;
                }
                resolve({ handledCount, effectRows });
            }
        };
        const execFailed = (err) => {
            __log.error("[RSS Subscribe] Analysis Rss Subscribe error!", err);
            reject(err);
        };
        const executor = new AsyncExecutor(execComplete, execFailed, parallelNum);
        const submitAndRun = () => {
            const handled = handledCount + failedCount;
            executor.submitAll(tasks.slice(handled, Math.min(handled + everyHandleCount, tasks.length)));
            executor.start();
        };
        submitAndRun();
    }).finally(() => rssUpdate.release());
}

/**
 * 定时自动拉取所有未完结订阅的更新、推送差异通知并触发收藏自动下载
 * @returns {Promise<void>}
 */
export async function autoUpdateSubscribe() {
    const { data: beforeUpdate } = await rssSubscribeRep.selectRssSubscribeCountsWithoutFin();
    const toUpdateIds = beforeUpdate.map(d => d.id);
    const { effectRows, handledCount } = await updateRssSubscribe(toUpdateIds);
    if (effectRows > 0) {
        const { data: afterUpdate } = await rssSubscribeRep.selectRssSubscribeCountsWithoutFin();
        const updated = [];
        afterUpdate.forEach(obj => {
            beforeUpdate.some(b => {
                if (b.id === obj.id) {
                    obj.counts - b.counts > 0 && updated.push({ id: obj.id, name: obj.name, cover: obj.cover, count: obj.counts - b.counts });
                    return true;
                }
                return false;
            });
        });
        if (updated.length > 0) {
            const trackers = await getTrackersMapping();
            const updatedRssSubs = [];
            for (const { id, name, cover, count } of updated) {
                const limitedData = await rssResultRep.selectRssResultsByPidWithLimit(id, count);
                const rssSubs = { name, cover, count };
                if (limitedData.rows === 0) {
                    continue;
                }
                rssSubs.id = id;
                rssSubs.result = limitedData.data.map(obj => ({
                    resultId: obj.id,
                    title: obj.title,
                    torrent: concatTrackers(obj.torrent, obj.tracker, trackers)
                }));
                updatedRssSubs.push(rssSubs);
            }
            pushToNotification({ effectRows, handledCount, updated: updatedRssSubs });
            const rssSubsArr = smoothArray(updatedRssSubs);
            pushToRssSubscription(rssSubsArr);
            await addRssTasksFromFavorites(rssSubsArr);
        }
        await updateSubscribesFin(toUpdateIds);
    }
    await updateSubscribeGoon(toUpdateIds);
}

/**
 * 推送 RSS 更新通知至 WebSocket
 * @param {Record<string, any>} data - 载荷数据
 */
function pushToNotification(data) {
    pushNotification(JSON.stringify({ event: 'RSS Subscribe', ...data }), 'Server');
}

/**
 * 展平并提取订阅任务列表
 * @param {Array<{ id: number, result?: Array<any> }>} data - 原始更新结果
 * @returns {Array<any>} 展平后的任务项数组
 */
function smoothArray(data) {
    const resultArr = [];
    const arr = Array.from(data);
    for (const { id, result } of arr) {
        Array.from(result || []).forEach(tObj => {
            resultArr.push({
                rssSubsId: id,
                ...tObj
            });
        });
    }
    return resultArr;
}

/**
 * 广播 RSS 订阅事件给已连接的 WebSocket 客户端
 * @param {Array<any>} rssSubsArr - 订阅任务项
 */
function pushToRssSubscription(rssSubsArr) {
    if (rssSubsArr.length > 0) {
        pushRssSubscription(JSON.stringify(rssSubsArr), 'Server');
    }
}

/**
 * 检查并更新已匹配集数达到总集数的订阅为完结状态
 * @param {number[]} toUpdateIds - 待检查的订阅 ID 列表
 * @returns {Promise<void>}
 */
async function updateSubscribesFin(toUpdateIds) {
    const { rows, data: subjects } = await rssSubscribeRep.selectSubjectTotalEpisodesBySubsIds(toUpdateIds);
    if (rows === 0) return;
    const toUpdateFinIds = [];
    const regex = /^[0-9]+$/;
    for (const id of toUpdateIds) {
        const subs = subjects.find(s => s.subsId === id);
        if (!subs) continue;
        const totalEpisodes = Number(subs.totalEpisodes);
        if (!Number.isInteger(totalEpisodes) || totalEpisodes <= 0) continue;
        const { rows, data: results } = await rssSubscribeRep.selectSubscribeResultsEpisodes(id);
        if (rows === 0) continue;
        const episodes = new Set();
        results.forEach(r => regex.test(r.episode) && Number.isInteger(Number(r.episode)) && episodes.add(r.episode));
        const total = episodes.size;
        if (totalEpisodes === total) {
            toUpdateFinIds.push(id);
        }
    }
    if (toUpdateFinIds.length > 0) {
        const updated = await rssSubscribeRep.updateFinByIds(toUpdateFinIds);
        updated.rows && __log.info(`[RSS Subscribe] Setup fin subjects:`, updated.rows);
    }
}

/**
 * 检查跨季度的未完结番剧并标记连载继续 (goon=1)
 * @param {number[]} ids - 订阅 ID 列表
 * @returns {Promise<void>}
 */
async function updateSubscribeGoon(ids) {
    const { rows, data: subs } = await rssSubscribeRep.selectGoonByIds(ids);
    if (rows === 0) return;
    const toUpdateGoonIds = [];
    const curSeason = getCurSeason().join('-');
    for (const { id, season, goon, fin } of subs) {
        if (__isBlank(season)) continue;
        if (fin === SUBSCRIBE_FIN_VALUE.NO && compareSeason(season, curSeason) < 0 && goon === SUBSCRIBE_GOON_VALUE.NO) {
            toUpdateGoonIds.push(id);
        }
    }
    if (toUpdateGoonIds.length === 0) return;
    const updated = await rssSubscribeRep.updateGoonByIds(toUpdateGoonIds, SUBSCRIBE_GOON_VALUE.YES);
    updated.rows && __log.info(`[RSS Subscribe] Setup goon subjects:`, updated.rows);
}