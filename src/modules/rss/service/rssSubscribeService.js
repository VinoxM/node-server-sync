import Parser from 'rss-parser';
import rssRep from '../repository/rssRep.js';
import rssSubscribeRep from '../repository/rssSubscribeRep.js';
import { AsyncExecutor } from '../../../core/infra/asyncExecutor.js';
import { addManyResult } from './rssResultService.js';
import { getUrlContent } from '../../../common/utils/httpUtil.js';
import { GetterContextSubscribe } from '../../../core/context/subscribe.js';
import { qdrantClient } from '../../../core/instance/qdrantClient.js';
import { RSS_SUBSCRIBE_SYNC_STATUS } from '../constants/rssSubscribeConsts.js';

const rssUpdate = {
    isUpdating: false
}

function convertRssXml2Json(content) {
    return new Parser().parseString(content);
}

export function isRssUpdating() {
    return rssUpdate.isUpdating;
}

export async function updateRssSubscribe(ids) {
    if (isRssUpdating()) {
        return Promise.reject({ code: -5, msg: "Rss is updating!" });
    }
    return new Promise(async (resolve, reject) => {
        __log.debug("[RSS Subscribe] Update Rss Subscribe.");
        let data = []
        try {
            if (__isNotEmptyArray(ids)) {
                data = await rssSubscribeRep.selectForSubscribeByIds(ids).then(res => res.data);
            } else {
                data = await rssRep.selectRssSubscribeWithoutFin().then(res => res.data);
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
        const arr = data.filter(obj => __isNotBlank(obj.url))
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
        const executor = new AsyncExecutor(() => {
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

export async function analysisRssSubscribe(obj, resolve, reject) {
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

export async function canDeleteSubscribe(id) {
    return (await rssSubscribeRep.selectEpisodesExistsSubsBySubsId(id)) === 0
}

export async function backfillEmptyNameVector(limited = 500) {
    const subs = await rssSubscribeRep.selectReadyVectors(limited).then(res => res.data)
    await updateNameVectorByIds(subs.map(d => d.id))
}

const collectionName = 'RssSubscribe'
async function ensureRssSubscribeCollection() {
    const ensure = await qdrantClient.ensureCollection(collectionName)
    if (!ensure) {
        await qdrantClient.createPayloadIndex(collectionName, 'fullTitle', {
            type: 'text',
            tokenizer: 'word',
            min_token_len: 1,
            max_token_len: 20
        });
    }
}

export async function updateNameVectorByIds(ids = []) {
    if (__isEmptyArray(ids)) return;
    await ensureRssSubscribeCollection()
    const { data } = await rssSubscribeRep.selectForVectorByIds(ids)
    if (data.length === 0) return;
    __log.info(`[RssSubscribe Vector] Update by ids:`, ids)
    await rssSubscribeRep.updateSyncStatusByIds(ids, RSS_SUBSCRIBE_SYNC_STATUS.PENDING)
    let finalStatus = RSS_SUBSCRIBE_SYNC_STATUS.COMPLETE
    let failedResults = []
    let completeResults = ids
    try {
        const results = await qdrantClient.upsertBatchWithEmbed(collectionName, data.map(d => ({
            id: d.id,
            payload: {
                name: d.name,
                nameJP: d.nameJp,
                season: d.season,
                fullTitle: d.name + " " + d.nameJp
            },
            textField: 'fullTitle'
        })))
        failedResults = results.filter(r => r.status !== 'completed')
    } catch (ex) {
        __log.error('[Rss Subscribe Vector] Upsert vector to qdrant failed. Cause:', ex)
        finalStatus = RSS_SUBSCRIBE_SYNC_STATUS.READY
    }
    if (finalStatus === RSS_SUBSCRIBE_SYNC_STATUS.COMPLETE && __isNotEmptyArray(failedResults)) {
        const failedIds = failedResults.flatMap(r => r.ids)
        __log.warn(`[Rss Subscribe Vector] ${failedIds.length} ids upsert failed:`, failedIds)
        await rssSubscribeRep.updateSyncStatusByIds(failedResults, RSS_SUBSCRIBE_SYNC_STATUS.READY)
        const failedResultsSet = new Set(failedResults)
        completeResults = ids.filter(id => !failedResultsSet.has(id))
    }
    __log.info(`[RssSubscribe Vector] Update by ids:`, ids)
    await rssSubscribeRep.updateSyncStatusByIds(completeResults, finalStatus)
}

export async function deleteNameVectorByIds(ids = []) {
    if (__isEmptyArray(ids)) return;
    const exists = await qdrantClient.collectionExists(collectionName)
    if (exists) {
        __log.info(`[RssSubscribe Vector] Delete by ids:`, ids)
        await qdrantClient.delete(collectionName, { ids })
    }
}

const similarityGetter = new GetterContextSubscribe("RssSemanticSearch", () => __env.get('rss.semanticSearch', {}))
export async function searchBySemantic(queryText, season) {
    const rssSemanticSearch = similarityGetter.getValue()
    const similarity = rssSemanticSearch?.similarity ?? 0.6
    await ensureRssSubscribeCollection()
    __log.info(`[RssSubscribe Search] Semantic search [queryText=${queryText}, season=${season || ''}, similarity=${similarity}]`)
    // semantic search
    const semanticResults = await qdrantClient.search(collectionName, queryText, {
        limit: 20,
        filter: __isBlank(season) ? null : {
            must: [
                {
                    key: 'season',
                    match: { value: season }
                }
            ]
        },
        withPayload: false,
        scoreThreshold: similarity
    });
    // full text search
    let textResults = [];
    try {
        textResults = await qdrantClient.search(collectionName, queryText, {
            filter: {
                must: [{ key: 'fullTitle', match: { text: queryText } }]
            },
            limit: 20,
            withPayload: false,
            scoreThreshold: similarity
        });
    } catch (e) {
        // ignored
        __log.error(`[RssSubscribe Search] Search [queryText=${queryText}, season=${season || ''}] by full text failed. Cause:`, e.message ?? e)
    }
    // merge results
    const mergedResults = new Map();
    textResults.forEach(item => mergedResults.set(item.id, item));
    semanticResults.forEach(item => mergedResults.set(item.id, item));
    // backfill result information
    const idResults = Array.from(mergedResults.keys())
    const valResults = Array.from(mergedResults.values())
    const similarityKey = 'score'
    if (__isNotEmptyArray(idResults)) {
        const result = await rssRep.selectRssSubscribeForSearchV2ByIds(idResults).then(res => res.data)
        return result.map(r => {
            r.similarity = valResults.find(o => o.id === r.id)?.[similarityKey]
            return r
        }).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)).slice(0, 20)
    }
    return []
}