import Parser from 'rss-parser';
import rssRep from '../../repository/rss/rssRep.js';
import rssSubscribeRep from '../../repository/rss/rssSubscribeRep.js';
import { Executor } from '../../common/executor.js';
import { addManyResult } from './rssResultHandler.js';
import { getUrlContent } from '../../common/httpUtil.js';

const { selectRssSubscribeWithoutFin } = rssRep;
const { selectForSubscribeByIds } = rssSubscribeRep;

const convertRssXml2Json = (content) => {
    return new Parser().parseString(content);
}

const rssUpdate = {
    isUpdating: false
}

const isRssUpdating = () => {
    return rssUpdate.isUpdating;
}

const updateRssSubscribe = (ids) => {
    if (isRssUpdating()) {
        return Promise.reject({ code: -5, msg: "Rss is updating!" });
    }
    return new Promise(async (resolve, reject) => {
        __log.debug("[RSS Subscribe] Update Rss Subscribe.");
        let data = []
        try {
            if (isNotEmptyArray(ids)) {
                data = await selectForSubscribeByIds(ids).then(res => res.data);
            } else {
                data = await selectRssSubscribeWithoutFin().then(res => res.data);
            }
        } catch (err) {
            __log.error(`[RSS Subscribe] Get rss subscribe list failed. Cause: ${err.message}`);
            return reject(err);
        }
        let result = [];
        let errorCount = 0;
        let handledCount = 0;
        let effectRows = 0;
        const { parallelNum = 3, everyHandleCount = 30, handleDelay = 20 * 1000 } = __env.get("rss.subscribeHandler", {});
        rssUpdate.isUpdating = true;
        const arr = data.filter(obj => isNotBlank(obj.url))
            .map(obj => (resolve_1) => {
                analysisRssSubscribe(obj, (results) => {
                    result = [...result, ...results];
                    handledCount++;
                    resolve_1();
                }, () => {
                    errorCount++;
                    resolve_1();
                });
            })
        const executor = new Executor(() => {
            const handled = handledCount + errorCount;
            if (handled < arr.length) {
                __log.debug(`Analysis Rss Subscribe delay ${handleDelay}ms. Handled: ${handled}, error: ${errorCount}.`);
                setTimeout(() => {
                    submitAndRun();
                }, handleDelay);
            } else {
                __log.debug(`Analysis Rss Subscribe complete. Total: ${arr.length}, Error: ${errorCount}, Results: ${result.length}`);
                if (result.length > 0) {
                    addManyResult(result).then((rows) => {
                        if (rows > 0) __log.info(`[RSS Subscribe] Update Rss Results complete. Rows: ${rows}`);
                        effectRows += rows;
                        resolve({ handledCount: handledCount, effectRows });
                        rssUpdate.isUpdating = false;
                    });
                } else {
                    resolve({ handledCount: handledCount, effectRows });
                    rssUpdate.isUpdating = false;
                }
            }
        }, (err) => {
            __log.info("[RSS Subscribe] Analysis Rss Subscribe error!", err);
            rssUpdate.isUpdating = false;
            reject(err);
        }, parallelNum);
        const submitAndRun = () => {
            const handled = handledCount + errorCount;
            executor.submitAll(arr.slice(handled, Math.min(handled + everyHandleCount, arr.length)));
            executor.start();
        }
        submitAndRun();
    })
}

const analysisRssSubscribe = (obj, resolve, reject) => {
    __log.debug(`[RssSubscribe Handler] Analysis RSS url: ${decodeURI(obj.url)}`);
    getUrlContent(obj.url).then(convertRssXml2Json).then(res => {
        let results = res.items ? (Array.isArray(res.items) ? res.items : [res.items]) : [];
        results = results.filter(item => {
            if (obj.regex && typeof obj.regex === "string" && obj.regex.length > 0) {
                const regex = JSON.parse(obj.regex);
                return regex.every(reg => new RegExp(reg).test(item?.title || ''));
            }
            return true;
        }).map(item => ({
            pid: obj.id,
            title: item.title,
            pubDate: item.pubDate,
            torrent: item.enclosure.url
        }));
        resolve(results);
    }).catch(err => {
        const idStr = !!obj?.id ? `[${obj.id}]` : ''
        __log.error(`[RssSubscribe Handler] Analysis Error: ${idStr}${decodeURI(obj.url)} , Cause: ${err.message}`);
        reject(err);
    });
}

export {
    updateRssSubscribe,
    isRssUpdating,
    analysisRssSubscribe
}