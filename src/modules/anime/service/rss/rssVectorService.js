import { handleCalendar } from "#common/utils/subjectUtil.js";
import { tryTranslateJaToZh } from "#common/utils/translateUtil.js";
import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { qdrantClient } from "#core/instance/qdrantClient.js";
import { RSS_SUBSCRIBE_VECTOR_STATUS } from "#modules/anime/constants/rssSubscribeConsts.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import subscribeRep from "#modules/anime/repository/subscribeRep.js";
import { getSummaryCNFromSummary } from "../subject/subjectCleanService.js";

const collectionName = 'RssSubscribe';
const batchUpsertLimited = 10;

/**
 * 将指定 Bangumi ID 的订阅向量状态重置为待同步 (READY)
 * @param {Array<number|string>} bangumiIds - Bangumi ID 列表
 * @returns {Promise<ExecResult|{ rows: number }>}
 */
export async function resetVectorStatusByBangumiIds(bangumiIds) {
    if (__isEmptyArray(bangumiIds)) return { rows: 0 };
    return subscribeRep.resetVectorStatusByBangumiIds(bangumiIds);
}

/**
 * 批量回填指定 Bangumi ID 条目的中文简介
 * @param {AbortSignal} [jobSignal] - 中断信号
 * @param {number} [limited=500] - 单次处理上限
 * @returns {Promise<void>}
 */
export async function backfillSubjectSummaryCN(jobSignal, limited = 500) {
    const preparedSubs = await subscribeRep.selectByVectorStatus(RSS_SUBSCRIBE_VECTOR_STATUS.PREPARED, limited).then(res => res.data);
    const bangumiIds = preparedSubs.map(d => d.bangumiId);
    if (__isEmptyArray(bangumiIds)) return;
    const { data: subjects } = await subjectsRep.selectByBangumiIds(bangumiIds);
    const toUpdateSubjects = [], needToResetBangumiIds = [];
    for (const { bangumiId, summary, summaryCN } of subjects) {
        if (jobSignal?.aborted) {
            __log.warn('[RssSubscribe Vector] Backfill summaryCN received abort signal, breaking loop gracefully.');
            break;
        }
        if (__isNotBlank(summary) && __isBlank(summaryCN)) {
            const summaryObj = getSummaryCNFromSummary(summary);
            if (__isNotBlank(summaryObj.summaryCN)) {
                toUpdateSubjects.push({ bangumiId, ...summaryObj });
                needToResetBangumiIds.push(bangumiId);
            } else {
                const translated = await tryTranslateJaToZh(summary);
                if (__isNotBlank(translated)) {
                    toUpdateSubjects.push({ bangumiId, summary, summaryCN: translated });
                    needToResetBangumiIds.push(bangumiId);
                }
            }
        }
    }
    if (__isNotEmptyArray(toUpdateSubjects)) {
        await subjectsRep.updateBatch(toUpdateSubjects, ['summary', 'summary_cn']);
        await resetVectorStatusByBangumiIds(needToResetBangumiIds);
    }
}

/**
 * 定时任务/自动回填：批量处理待同步 (READY) 的番剧名称与简介向量
 * @param {AbortSignal} [jobSignal] - 中断信号
 * @param {number} [limited=500] - 单次处理上限
 * @returns {Promise<void>}
 */
export async function backfillSubscribeVector(jobSignal, limited = 500) {
    const readySubs = await subscribeRep.selectByVectorStatus(RSS_SUBSCRIBE_VECTOR_STATUS.READY, limited).then(res => res.data);
    const bangumiIds = readySubs.map(d => d.bangumiId);
    for (let i = 0; i < bangumiIds.length; i += batchUpsertLimited) {
        if (jobSignal?.aborted) {
            __log.warn('[RssSubscribe Vector] Backfill vector received abort signal, breaking loop gracefully.');
            break;
        }
        const batch = bangumiIds.slice(i, i + batchUpsertLimited);
        await updateNameVectorByBangumiIds(batch);
    }
}

/**
 * 确保 Qdrant 中存在 RssSubscribe 集合并建立 fullTitle 字段的多语言文本索引
 * @returns {Promise<void>}
 */
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

/**
 * 格式化字符串数组为换行符分隔的文本
 * @param {Array<string>} strArr - 字符串数组
 * @returns {string}
 */
function resolveVectorStrArray(strArr) {
    if (__isNotEmptyArray(strArr)) {
        return `${strArr.filter(__isNotBlank).join('\n')}`;
    }
    return '';
}

/**
 * 批量提取指定 Bangumi ID 的条目元数据，计算 Embeddings 并 Upsert 到 Qdrant 向量数据库
 * @param {Array<number|string>} [bangumiIds=[]] - Bangumi ID 列表
 * @returns {Promise<void>}
 */
async function updateNameVectorByBangumiIds(bangumiIds = []) {
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
        await subscribeRep.updateVectorStatusByBangumiIds(failedIds, RSS_SUBSCRIBE_VECTOR_STATUS.READY);
        const failedResultsSet = new Set(failedIds);
        completeResults = bangumiIds.filter(id => !failedResultsSet.has(id));
    }
    __log.info(`[RssSubscribe Vector] Update by bangumiIds:`, completeResults);
    await subscribeRep.updateVectorStatusByBangumiIds(completeResults, finalStatus);
}

/**
 * 从 Qdrant 向量库中删除指定 Bangumi ID 的向量记录
 * @param {Array<number|string>} [bangumiIds=[]] - Bangumi ID 列表
 * @returns {Promise<void>}
 */
export async function deleteNameVectorByBangumiIds(bangumiIds = []) {
    if (__isEmptyArray(bangumiIds)) return;
    const exists = await qdrantClient.collectionExists(collectionName);
    if (exists) {
        __log.info(`[RssSubscribe Vector] Delete by ids:`, bangumiIds);
        await qdrantClient.delete(collectionName, { ids: bangumiIds });
    }
}

/**
 * 语义搜索配置上下文订阅（读取 similarity 相似度阈值）
 */
const similarityGetter = new GetterContextSubscribe("RssSemanticSearch", () => __env.get('rss.semanticSearch', {}));

/**
 * 结合 Qdrant 向量语义相似度与全文匹配进行番剧智能混合检索
 * @param {string} queryText - 搜索文本
 * @param {string} [season] - 季度过滤 (如 '2026-10')
 * @param {number} [similarity] - 相似度
 * @param {UserInfo} [userInfo] - 当前用户信息（用于日历视图过滤）
 * @returns {Promise<Array<import('#types/animeTypes.d.ts').AnimeCalendarItem>>}
 */
export async function searchBySemantic(queryText, season, similarityThreshold, userInfo) {
    const rssSemanticSearch = similarityGetter.getValue();
    const similarity = similarityThreshold ?? rssSemanticSearch?.similarity ?? 0.6;
    await ensureSubjectSubscribeCollection();
    __log.info(`[RssSubscribe Search] Semantic search [queryText=${queryText}, season=${season || ''}, similarity=${similarity}]`);
    // 语义向量搜索
    const seasonFilters = __isBlank(season) ? null : [{ key: 'season', match: { value: season } }];
    const semanticResults = await qdrantClient.search(collectionName, queryText, {
        limit: 20,
        filter: seasonFilters ? { must: seasonFilters } : null,
        withPayload: false,
        scoreThreshold: similarity
    });
    // 全文检索 (fullTitle)
    let textResults = [];
    try {
        textResults = await qdrantClient.search(collectionName, queryText, {
            filter: {
                must: [{ key: 'fullTitle', match: { text: queryText } }, ...(seasonFilters ?? [])]
            },
            limit: 20,
            withPayload: false,
            scoreThreshold: similarity
        });
    } catch (e) {
        // ignored
        __log.error(`[RssSubscribe Search] Search [queryText=${queryText}, season=${season || ''}] by full text failed. Cause:`, e.message ?? e);
    }
    // 合并去重检索结果
    const mergedResults = new Map();
    textResults.forEach(item => mergedResults.set(item.id, item));
    semanticResults.forEach(item => mergedResults.set(item.id, item));
    // 回填番剧详细信息并按相似度得分降序排序
    const idResults = Array.from(mergedResults.keys());
    const valResults = Array.from(mergedResults.values());
    const similarityKey = 'score';
    if (__isNotEmptyArray(idResults)) {
        const { data: result } = await subjectsRep.selectVisibleByBangumiIds(idResults, season);
        const resultData = result.map(r => {
            r.similarity = valResults.find(o => o.id === r.bangumiId)?.[similarityKey];
            return r;
        }).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
            .slice(0, 20);
        return handleCalendar(resultData, userInfo);
    }
    return [];
}