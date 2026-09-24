import { handleCalendar } from "#common/utils/subjectUtil.js";
import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { qdrantHybridClient } from "#core/instance/qdrantClient.js";
import { RSS_SUBSCRIBE_VECTOR_STATUS } from "#modules/anime/constants/rssSubscribeConsts.js";
import { SUBJECT_HIDE_VALUE, SUBJECT_NSFW_VALUE } from "#modules/anime/constants/subjectConstant.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import subscribeRep from "#modules/anime/repository/subscribeRep.js";

/** 
 * Qdrant 混合检索集合名称
 * @readonly
 * @enum {string}
 */
const SUBSCRIBE_COLLECTION_NAME = 'RssSubscribeHybrid';

/**
 * 集合初始化 Promise 缓存：避免每次读写都重复发起 collectionExists 探测 RPC
 * @type {Promise<void>|null}
 */
let ensureCollectionPromise = null;

/**
 * 将指定 Bangumi ID 的订阅向量状态重置为待同步状态
 * （依据 subjects 摘要情况推导为 PREPARED 或 READY，无关联条目时回退为 READY）
 * @param {Array<number|string>} bangumiIds - Bangumi ID 列表
 * @returns {Promise<ExecResult|{ rows: number }>}
 */
export async function resetVectorStatusByBangumiIds(bangumiIds) {
    if (__isEmptyArray(bangumiIds)) return { rows: 0 };
    return subscribeRep.resetVectorStatusByBangumiIds(bangumiIds);
}

/**
 * 使集合初始化缓存失效（创建失败或集合被外部删除时调用，令下次访问重新确保集合存在）
 */
function invalidateEnsureCollectionCache() {
    ensureCollectionPromise = null;
}

/**
 * 实际创建/校验 RssSubscribeHybrid 混合检索集合并建立过滤字段索引
 * @returns {Promise<void>}
 */
async function createSubjectSubscribeCollection() {
    const existed = await qdrantHybridClient.ensureCollection(SUBSCRIBE_COLLECTION_NAME);
    if (existed) return;
    const results = await Promise.allSettled([
        qdrantHybridClient.createPayloadIndex(SUBSCRIBE_COLLECTION_NAME, 'season', 'keyword'),
        qdrantHybridClient.createPayloadIndex(SUBSCRIBE_COLLECTION_NAME, 'hide', 'integer'),
        qdrantHybridClient.createPayloadIndex(SUBSCRIBE_COLLECTION_NAME, 'nsfw', 'integer')
    ]);
    results.filter(r => r.status === 'rejected')
        .forEach(r => __log.warn(`[RssSubscribe HybridVector] Create payload index failed. Cause:`, r.reason?.message ?? r.reason));
}

/**
 * 确保 Qdrant 中存在 RssSubscribeHybrid 混合检索集合（包含 dense + sparse 向量索引），并创建常用过滤字段索引
 * 结果按进程缓存，避免每次读写都进行集合探测；创建失败或集合缺失时缓存自动失效重试
 * @returns {Promise<void>}
 */
function ensureSubjectSubscribeCollection() {
    if (!ensureCollectionPromise) {
        ensureCollectionPromise = createSubjectSubscribeCollection().catch(ex => {
            invalidateEnsureCollectionCache();
            throw ex;
        });
    }
    return ensureCollectionPromise;
}

/**
 * 安全解析 JSON 字符串
 * @param {string|any} val
 * @param {any} [defaultVal=[]]
 * @returns {any}
 */
function safeJsonParse(val, defaultVal = []) {
    if (val === null || val === undefined) return defaultVal;
    if (typeof val !== 'string') return val;
    try {
        return JSON.parse(val);
    } catch {
        return defaultVal;
    }
}

/**
 * 安全解析 JSON 数组字段（解析失败或结果非数组时返回空数组）
 * @param {string|any} val
 * @returns {Array<any>}
 */
function safeJsonArray(val) {
    const parsed = safeJsonParse(val, []);
    return Array.isArray(parsed) ? parsed : [];
}

/**
 * 安全解析 JSON 对象字段（解析失败或结果非对象时返回空对象）
 * @param {string|any} val
 * @returns {Record<string, any>}
 */
function safeJsonObject(val) {
    const parsed = safeJsonParse(val, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/**
 * 从 staff JSON 中提取制作公司/工作室列表
 * @param {Array<object|string>} staffList
 * @returns {string[]}
 */
function extractStudios(staffList) {
    if (!Array.isArray(staffList)) return [];
    const studios = new Set();
    for (const item of staffList) {
        if (!item) continue;
        if (typeof item === 'string') {
            if (__isNotBlank(item)) studios.add(item.trim());
            continue;
        }
        const job = item.job || '';
        const person = item.person || item.name || '';
        if (person && (job.includes('动画制作') || job.includes('制作') || job.includes('Animation') || job.includes('Studio'))) {
            studios.add(person.trim());
        }
    }
    return Array.from(studios);
}

/**
 * 从 characters JSON 中提取声优 CV 列表
 * @param {Array<object|string>} charList
 * @returns {string[]}
 */
function extractCvList(charList) {
    if (!Array.isArray(charList)) return [];
    const cvs = new Set();
    for (const item of charList) {
        if (!item) continue;
        if (typeof item === 'string') {
            if (__isNotBlank(item)) cvs.add(item.trim());
            continue;
        }
        const cv = item.cv || item.actor || item.actors?.[0]?.name;
        if (cv && typeof cv === 'string' && __isNotBlank(cv)) {
            cvs.add(cv.trim());
        }
    }
    return Array.from(cvs);
}

/**
 * 解析 subjects 表记录并构造结构化语义文本与 Payload
 * @param {object} subject - 数据库原始记录
 * @returns {{ id: number, payload: object, textField: string }}
 */
function buildSubjectVectorItem(subject) {
    const aliases = safeJsonArray(subject.nameAlias);
    const metaTags = safeJsonArray(subject.metaTags);
    const staffList = safeJsonArray(subject.staff);
    const charList = safeJsonArray(subject.characters);

    const studios = extractStudios(staffList);
    const cvList = extractCvList(charList);

    // 优先使用中文简介，为空时回退到日文简介 (summary)，截取前 300 字符
    const summaryMulti = safeJsonObject(subject.summaryMulti);
    const rawSummary = __isNotBlank(summaryMulti.cn) ? summaryMulti.cn : __isBlankOr(summaryMulti.jp, subject.summary) || '';
    const cleanSummary = rawSummary.replace(/\s+/g, ' ').trim().slice(0, 300);

    const textParts = [];

    // 1. 标题与别名
    const titles = [subject.nameCN, subject.name].filter(__isNotBlank).join(' / ');
    if (titles) textParts.push(`【标题】${titles}`);
    if (aliases.length > 0) textParts.push(`【别名】${aliases.join('、')}`);

    // 2. 标签题材
    if (metaTags.length > 0) textParts.push(`【标签】${metaTags.join(' ')}`);

    // 3. 阵容与声优
    const lineupParts = [];
    if (studios.length > 0) lineupParts.push(`制作: ${studios.join('、')}`);
    if (cvList.length > 0) lineupParts.push(`声优: ${cvList.slice(0, 8).join('、')}`);
    if (lineupParts.length > 0) textParts.push(`【阵容】${lineupParts.join(' | ')}`);

    // 4. 简介
    if (cleanSummary) textParts.push(`【简介】${cleanSummary}`);

    const fullText = textParts.join('\n');

    return {
        id: subject.bangumiId,
        payload: {
            bangumiId: subject.bangumiId,
            name: subject.name,
            nameCN: subject.nameCN,
            nameAlias: aliases,
            season: subject.season,
            airDate: subject.airDate,
            platform: subject.platform,
            metaTags,
            studios,
            cvList,
            hide: subject.hide ?? 0,
            nsfw: subject.nsfw ?? 0,
            summary: cleanSummary,
            fullText
        },
        textField: 'fullText'
    };
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
    if (data.length === 0) {
        __log.warn(`[RssSubscribe HybridVector] No vectorizable subscribe found, skipped. bangumiIds:`, bangumiIds);
        return;
    }
    // 状态流转必须严格基于真正参与本次写入的 targetIds，避免把未生成向量的条目误标为 COMPLETE
    const targetIds = data.map(d => d.bangumiId);
    if (targetIds.length !== bangumiIds.length) {
        __log.warn(`[RssSubscribe HybridVector] ${bangumiIds.length - targetIds.length} bangumiIds skipped (not subscribed / already PENDING):`,
            bangumiIds.filter(id => !targetIds.includes(id)));
    }
    __log.info(`[RssSubscribe HybridVector] Update by ids:`, targetIds);
    await subscribeRep.updateVectorStatusByBangumiIds(targetIds, RSS_SUBSCRIBE_VECTOR_STATUS.PENDING);
    let finalStatus = RSS_SUBSCRIBE_VECTOR_STATUS.COMPLETE;
    let failedResults = [];
    let completeResults = targetIds;
    try {
        const vectorItems = data.map(d => buildSubjectVectorItem(d));
        const results = await qdrantHybridClient.upsertBatchWithEmbed(SUBSCRIBE_COLLECTION_NAME, vectorItems);
        failedResults = results.filter(r => r.status !== 'completed');
    } catch (ex) {
        __log.error('[RssSubscribe HybridVector] Upsert hybrid vector to qdrant failed. Cause:', ex);
        invalidateEnsureCollectionCache();
        finalStatus = RSS_SUBSCRIBE_VECTOR_STATUS.READY;
    }
    if (finalStatus === RSS_SUBSCRIBE_VECTOR_STATUS.COMPLETE && __isNotEmptyArray(failedResults)) {
        const failedIds = failedResults.flatMap(r => r.ids);
        __log.warn(`[RssSubscribe HybridVector] ${failedIds.length} bangumiIds upsert failed:`, failedIds);
        await subscribeRep.updateVectorStatusByBangumiIds(failedIds, RSS_SUBSCRIBE_VECTOR_STATUS.READY);
        const failedResultsSet = new Set(failedIds);
        completeResults = targetIds.filter(id => !failedResultsSet.has(id));
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
    if (!exists) {
        // 集合不存在说明本地初始化缓存已失效，重置以免后续读写走错分支
        invalidateEnsureCollectionCache();
        return;
    }
    __log.info(`[RssSubscribe HybridVector] Delete by ids:`, bangumiIds);
    await qdrantHybridClient.delete(SUBSCRIBE_COLLECTION_NAME, { ids: bangumiIds });
}

/**
 * 语义搜索配置上下文订阅（读取 similarity 相似度阈值）
 */
const similarityGetter = new GetterContextSubscribe("RssSemanticSearch", () => __env.get('rss.semanticSearch', {}));

/**
 * 结合 Qdrant 稠密语义 (Dense) 与稀疏词权 (Sparse) 进行番剧双路召回 RRF 混合检索
 * @param {string} queryText - 搜索文本
 * @param {string} [season] - 季度过滤 (如 '2026-10')
 * @param {number} [similarityThreshold] - 稠密分支语义余弦相似度阈值 (0.0~1.0)，低于该值的稠密命中被丢弃
 * @param {UserInfo} [userInfo] - 当前用户信息（用于日历视图过滤）
 * @returns {Promise<Array<import('#types/animeTypes.d.ts').AnimeCalendarItem>>}
 */
export async function searchBySemantic(queryText, season, similarityThreshold, userInfo) {
    const rssSemanticSearch = similarityGetter.getValue();
    const similarity = similarityThreshold ?? rssSemanticSearch?.similarity ?? 0.3;
    await ensureSubjectSubscribeCollection();
    __log.info(`[RssSubscribe Search] Hybrid semantic search [queryText=${queryText}, season=${season || ''}, similarityThreshold=${similarity}]`);

    // 1. 过滤条件下推到 Qdrant：排除已隐藏番剧 + 匿名用户排除限制级内容 + 季度过滤
    //    NSFW 必须在向量召回阶段就过滤，否则 top-N 候选会被限制级条目占满，匿名用户可能返回空结果
    const mustFilters = [
        { key: 'hide', match: { value: SUBJECT_HIDE_VALUE.NO } },
        ...(userInfo ? [] : [{ key: 'nsfw', match: { value: SUBJECT_NSFW_VALUE.NO } }]),
        ...(__isBlank(season) ? [] : [{ key: 'season', match: { value: season } }])
    ];

    // 2. 单次 RPC 发起 Dense + Sparse 双路召回，融合排序在客户端完成（不是 Qdrant 服务端 fusion）
    //    scoreThreshold 仅作用于 Dense 分支的余弦相似度底噪；Sparse 精确关键词命中条目保留
    let points;
    try {
        points = await qdrantHybridClient.search(SUBSCRIBE_COLLECTION_NAME, queryText, {
            limit: 20,
            filter: { must: mustFilters },
            scoreThreshold: similarity,
            withPayload: false,
            fusion: 'rrf'
        });
    } catch (ex) {
        // 检索失败可能源于集合被外部删除，重置集合缓存令下次请求自愈重建
        invalidateEnsureCollectionCache();
        throw ex;
    }

    if (__isEmptyArray(points)) return [];

    // 3. 回填番剧详细信息：按混合融合分数排序，展示用相似度取真实余弦分数（仅稀疏命中的条目无此分数）
    const idResults = points.map(p => p.id);
    const { data: result } = await subjectsRep.selectVisibleByBangumiIds(idResults, season);
    const fusionScoreMap = new Map(points.map(p => [p.id, p.score]));
    const similarityMap = new Map(points.map(p => [p.id, p.denseScore]));

    const resultData = result.map(r => {
        r.similarity = similarityMap.get(r.bangumiId);
        return r;
    }).sort((a, b) => (fusionScoreMap.get(b.bangumiId) ?? 0) - (fusionScoreMap.get(a.bangumiId) ?? 0))
        .slice(0, 20);

    return handleCalendar(resultData, userInfo);
}
