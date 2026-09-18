import { handleCalendar } from "#common/utils/subjectUtil.js";
import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { qdrantClient } from "#core/instance/qdrantClient.js";
import { RSS_SUBSCRIBE_VECTOR_STATUS } from "#modules/anime/constants/rssSubscribeConsts.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import subscribeRep from "#modules/anime/repository/subscribeRep.js";

export async function resetVectorStatusByBangumiIds(bangumiIds) {
    if (__isEmptyArray(bangumiIds)) return { rows: 0 };
    return subscribeRep.updateVectorStatusByBangumiIds(bangumiIds, RSS_SUBSCRIBE_VECTOR_STATUS.READY);
}

export async function backfillEmptyNameVector(limited = 500) {
    const subs = await subscribeRep.selectReadyVectors(limited).then(res => res.data);
    await updateNameVectorByBangumiIds(subs.map(d => d.bangumiId));
}

const collectionName = 'RssSubscribe';
async function ensureSubjectSubscribeCollection() {
    const ensure = await qdrantClient.ensureCollection(collectionName);
    if (!ensure) {
        await qdrantClient.createPayloadIndex(collectionName, 'fullTitle', {
            type: 'text',
            tokenizer: 'multilingual',
            min_token_len: 1,
            max_token_len: 30,
            lowercase: true
        });
    }
}

function resolveVectorStrArray(strArr) {
    if (__isNotEmptyArray(strArr)) {
        return `${strArr.filter(__isNotBlank).join('\n')}`;
    }
    return '';
}

export async function updateNameVectorByBangumiIds(bangumiIds = []) {
    if (__isEmptyArray(bangumiIds)) return;
    await ensureSubjectSubscribeCollection();
    const { data } = await subscribeRep.selectForVectorByBangumiIds(bangumiIds);
    if (data.length === 0) return;
    __log.info(`[RssSubscribe Vector] Update by ids:`, bangumiIds);
    await subscribeRep.updateVectorStatusByBangumiIds(bangumiIds, RSS_SUBSCRIBE_VECTOR_STATUS.PENDING);
    let finalStatus = RSS_SUBSCRIBE_VECTOR_STATUS.COMPLETE;
    let failedResults = [];
    let completeResults = bangumiIds;
    try {
        const results = await qdrantClient.upsertBatchWithEmbed(collectionName, data.map(d => ({
            id: d.bangumiId,
            payload: {
                season: d.season,
                name: d.name,
                nameCN: d.nameCN,
                nameAlias: JSON.parse(d.nameAlias || '[]'),
                fullTitle: [
                    __isBlankOr(d.name, ''),
                    __isBlankOr(d.nameCN, ''),
                    resolveVectorStrArray(JSON.parse(d.nameAlias || '[]')),
                    __isBlankOr(d.summary, '')
                ].filter(__isNotBlank).join(' ')
            },
            textField: 'fullTitle'
        })));
        failedResults = results.filter(r => r.status !== 'completed');
    } catch (ex) {
        __log.error('[RssSubscribe Vector] Upsert vector to qdrant failed. Cause:', ex);
        finalStatus = RSS_SUBSCRIBE_VECTOR_STATUS.READY;
    }
    if (finalStatus === RSS_SUBSCRIBE_VECTOR_STATUS.COMPLETE && __isNotEmptyArray(failedResults)) {
        const failedIds = failedResults.flatMap(r => r.ids);
        __log.warn(`[RssSubscribe Vector] ${failedIds.length} bangumiIds upsert failed:`, failedIds);
        await subscribeRep.updateVectorStatusByBangumiIds(failedResults, RSS_SUBSCRIBE_VECTOR_STATUS.READY);
        const failedResultsSet = new Set(failedResults);
        completeResults = bangumiIds.filter(id => !failedResultsSet.has(id));
    }
    __log.info(`[RssSubscribe Vector] Update by bangumiIds:`, completeResults);
    await subscribeRep.updateVectorStatusByBangumiIds(completeResults, finalStatus);
}

export async function deleteNameVectorByBangumiIds(bangumiIds = []) {
    if (__isEmptyArray(bangumiIds)) return;
    const exists = await qdrantClient.collectionExists(collectionName);
    if (exists) {
        __log.info(`[RssSubscribe Vector] Delete by ids:`, bangumiIds);
        await qdrantClient.delete(collectionName, { ids: bangumiIds });
    }
}

const similarityGetter = new GetterContextSubscribe("RssSemanticSearch", () => __env.get('rss.semanticSearch', {}))
export async function searchBySemantic(queryText, season, userInfo) {
    const rssSemanticSearch = similarityGetter.getValue()
    const similarity = rssSemanticSearch?.similarity ?? 0.6
    await ensureSubjectSubscribeCollection()
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
    const idResults = Array.from(mergedResults.keys());
    const valResults = Array.from(mergedResults.values());
    const similarityKey = 'score';
    if (__isNotEmptyArray(idResults)) {
        const { data: result } = await subjectsRep.selectVisibleByBangumiIds(idResults);
        const resultData = result.map(r => {
            r.similarity = valResults.find(o => o.id === r.bangumiId)?.[similarityKey];
            return r;
        }).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
            .slice(0, 20);
        return handleCalendar(resultData, userInfo);
    }
    return [];
}