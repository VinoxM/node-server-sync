import { handleCalendar } from "#common/utils/subjectUtil.js";
import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { qdrantHybridClient } from "#core/instance/qdrantClient.js";
import { RSS_SUBSCRIBE_VECTOR_STATUS } from "#modules/anime/constants/rssSubscribeConsts.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import subscribeRep from "#modules/anime/repository/subscribeRep.js";

/** 
 * Qdrant 混合检索集合名称
 * @readonly
 * @enum {string}
 */
const SUBSCRIBE_COLLECTION_NAME = 'RssSubscribeHybrid';

/** @type {number} 单次批量 Upsert 条数限制 */
const batchUpsertLimited = 10;

/**
 * 将指定 Bangumi ID 的订阅向量状态重置为待同步 (PREPARED)
 * @param {Array<number|string>} bangumiIds - Bangumi ID 列表
 * @returns {Promise<ExecResult|{ rows: number }>}
 */
export async function resetVectorStatusByBangumiIds(bangumiIds) {
    if (__isEmptyArray(bangumiIds)) return { rows: 0 };
    return subscribeRep.resetVectorStatusByBangumiIds(bangumiIds);
}

/**
 * 确保 Qdrant 中存在 RssSubscribeHybrid 混合检索集合（包含 dense + sparse 向量索引）
 * @returns {Promise<void>}
 */
async function ensureSubjectSubscribeCollection() {
    await qdrantHybridClient.ensureCollection(SUBSCRIBE_COLLECTION_NAME);
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
 * 批量提取指定 Bangumi ID 的条目元数据，提取 Dense+Sparse 混合向量并 Upsert 到 Qdrant 向量数据库
 * @param {Array<number|string>} [bangumiIds=[]] - Bangumi ID 列表
 * @returns {Promise<void>}
 */
export async function updateSubscribeVector(bangumiIds = []) {
    if (__isEmptyArray(bangumiIds)) return;
    await ensureSubjectSubscribeCollection();
    const { data } = await subscribeRep.selectForVectorByBangumiIds(bangumiIds);
    if (data.length === 0) return;
    __log.info(`[RssSubscribe HybridVector] Update by ids:`, bangumiIds);
    await subscribeRep.updateVectorStatusByBangumiIds(bangumiIds, RSS_SUBSCRIBE_VECTOR_STATUS.PENDING);
    let finalStatus = RSS_SUBSCRIBE_VECTOR_STATUS.COMPLETE;
    let failedResults = [];
    let completeResults = bangumiIds;
    try {
        const results = await qdrantHybridClient.upsertBatchWithEmbed(SUBSCRIBE_COLLECTION_NAME, data.map(d => ({
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
        __log.error('[RssSubscribe HybridVector] Upsert hybrid vector to qdrant failed. Cause:', ex);
        finalStatus = RSS_SUBSCRIBE_VECTOR_STATUS.READY;
    }
    if (finalStatus === RSS_SUBSCRIBE_VECTOR_STATUS.COMPLETE && __isNotEmptyArray(failedResults)) {
        const failedIds = failedResults.flatMap(r => r.ids);
        __log.warn(`[RssSubscribe HybridVector] ${failedIds.length} bangumiIds upsert failed:`, failedIds);
        await subscribeRep.updateVectorStatusByBangumiIds(failedIds, RSS_SUBSCRIBE_VECTOR_STATUS.READY);
        const failedResultsSet = new Set(failedIds);
        completeResults = bangumiIds.filter(id => !failedResultsSet.has(id));
    }
    __log.info(`[RssSubscribe HybridVector] Update by bangumiIds:`, completeResults);
    await subscribeRep.updateVectorStatusByBangumiIds(completeResults, finalStatus);
}

/**
 * 从 Qdrant 混合向量库中删除指定 Bangumi ID 的向量记录
 * @param {Array<number|string>} [bangumiIds=[]] - Bangumi ID 列表
 * @returns {Promise<void>}
 */
export async function deleteNameVectorByBangumiIds(bangumiIds = []) {
    if (__isEmptyArray(bangumiIds)) return;
    const exists = await qdrantHybridClient.collectionExists(SUBSCRIBE_COLLECTION_NAME);
    if (exists) {
        __log.info(`[RssSubscribe HybridVector] Delete by ids:`, bangumiIds);
        await qdrantHybridClient.delete(SUBSCRIBE_COLLECTION_NAME, { ids: bangumiIds });
    }
}

/**
 * 语义搜索配置上下文订阅（读取 similarity 相似度阈值）
 */
const similarityGetter = new GetterContextSubscribe("RssSemanticSearch", () => __env.get('rss.semanticSearch', {}));

/**
 * 结合 Qdrant 稠密语义 (Dense) 与稀疏词权 (Sparse) 进行番剧双路召回 RRF 混合检索
 * @param {string} queryText - 搜索文本
 * @param {string} [season] - 季度过滤 (如 '2026-10')
 * @param {number} [similarityThreshold] - 相似度阈值 (0.0~1.0)
 * @param {UserInfo} [userInfo] - 当前用户信息（用于日历视图过滤）
 * @returns {Promise<Array<import('#types/animeTypes.d.ts').AnimeCalendarItem>>}
 */
export async function searchBySemantic(queryText, season, similarityThreshold, userInfo) {
    const rssSemanticSearch = similarityGetter.getValue();
    const similarity = similarityThreshold ?? rssSemanticSearch?.similarity ?? 0.3;
    await ensureSubjectSubscribeCollection();
    __log.info(`[RssSubscribe Search] Hybrid semantic search [queryText=${queryText}, season=${season || ''}, similarityThreshold=${similarity}]`);

    // 1. 季度过滤条件
    const seasonFilters = __isBlank(season) ? null : [{ key: 'season', match: { value: season } }];

    // 2. 发起 Qdrant 原生 Dense + Sparse 双路召回与 RRF 融合排序（单次 RPC）
    // Dense 稠密分支直接使用 scoreThreshold 做语义余弦底噪过滤，Sparse 精确关键词匹配条目保留
    const points = await qdrantHybridClient.search(SUBSCRIBE_COLLECTION_NAME, queryText, {
        limit: 20,
        filter: seasonFilters ? { must: seasonFilters } : null,
        scoreThreshold: similarity,
        withPayload: true,
        fusion: 'rrf'
    });

    if (__isEmptyArray(points)) return [];

    // 3. 回填番剧详细信息并按综合排序呈现
    const idResults = points.map(p => p.id);
    const { data: result } = await subjectsRep.selectVisibleByBangumiIds(idResults, season);
    const similarityMap = new Map(points.map(p => [p.id, p.score]));

    const resultData = result.map(r => {
        r.similarity = similarityMap.get(r.bangumiId);
        return r;
    }).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
        .slice(0, 20);

    return handleCalendar(resultData, userInfo);
}
