import rssSubscribeRep from '#modules/anime/repository/rss/rssSubscribeRep.js';
import { AsyncExecutor } from '#core/infra/asyncExecutor.js';
import { addManyResult } from './rssResultService.js';
import { analysisRssSubscribe } from './rssSubscribeService.js';

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

async function getUpdateRssSubscirbe(subsIds) {
    try {
        const { data } = await rssSubscribeRep.selectForSubscribeUpdate(subsIds);
        return data.filter(o => __isNotBlank(o.url));
    } catch (err) {
        __log.error(`[RSS Subscribe] Get rss subscribe list failed. Cause:`, err.message ?? err);
        return [];
    }
}

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
                __log.debug(`Analysis Rss Subscribe delay ${handleDelay}ms. Handled: ${handled}, failed: ${failedCount}.`);
                setTimeout(() => {
                    submitAndRun();
                }, handleDelay);
            } else {
                __log.debug(`Analysis Rss Subscribe complete. Total: ${tasks.length}, Error: ${failedCount}, Results: ${rssResults.length}`);
                if (rssResults.length > 0) {
                    const rows = await addManyResult(rssResults);
                    rows > 0 && __log.info(`[RSS Subscribe] Update Rss Results complete. Rows: ${rows}`);
                    effectRows += rows;
                }
                resolve({ handledCount, effectRows });
            }
        };
        const execFailed = (err) => {
            __log.info("[RSS Subscribe] Analysis Rss Subscribe error!", err);
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