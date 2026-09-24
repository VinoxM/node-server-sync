import { RSS_SUBSCRIBE_VECTOR_STATUS } from "#modules/anime/constants/rssSubscribeConsts.js";
import subscribeRep from "#modules/anime/repository/subscribeRep.js";
import { resetVectorStatusByBangumiIds, updateSubscribeVector } from "#modules/anime/service/rss/rssHybridVectorService.js";
import { backfillSubjectsSummaryMulti } from "../bangumi/bangumiBackfillService.js";

/**
 * 批量更新上限
 * @readonly
 * @enum {number}
 */
const BATCH_BACKFILL_LIMITED = 10;
/**
 * 批量回填指定 Bangumi ID 条目的中文简介
 * @param {AbortSignal} [jobSignal] - 中断信号
 * @param {number} [limited=200] - 单次处理上限
 * @returns {Promise<void>}
 */
export async function backfillSubjectSummaryMultiSchedule(jobSignal, limited = 200) {
    const preparedSubs = await subscribeRep.selectByVectorStatus(RSS_SUBSCRIBE_VECTOR_STATUS.PREPARED, limited).then(res => res.data);
    const bangumiIds = preparedSubs.map(d => d.bangumiId);
    if (__isEmptyArray(bangumiIds)) return;
    const total = bangumiIds.length;
    let effectedRows = 0, handledRows = 0;
    for (let i = 0; i < bangumiIds.length; i += BATCH_BACKFILL_LIMITED) {
        if (jobSignal?.aborted) {
            __log.warn('[Subject Schedule] Backfill summaryMulti received abort signal, breaking loop gracefully.');
            break;
        }
        const batch = bangumiIds.slice(i, i + BATCH_BACKFILL_LIMITED);
        const { updated, handled } = await backfillSubjectsSummaryMulti(batch, jobSignal);
        handledRows += handled;
        effectedRows += updated;
        __log.info(`[Subject Schedule] Backfill summaryMulti resolved: ${handledRows}/${total}, effected: ${effectedRows}.`)
        await resetVectorStatusByBangumiIds(batch);
    }
}

/**
 * 批量更新上限
 * @readonly
 * @enum {number}
 */
const BATCH_UPSERT_LIMITED = 10;
/**
 * 定时任务/自动回填：批量处理待同步 (READY) 的番剧名称与简介向量
 * @param {AbortSignal} [jobSignal] - 中断信号
 * @param {number} [limited=500] - 单次处理上限
 * @returns {Promise<void>}
 */
export async function backfillSubscribeVectorSchedule(jobSignal, limited = 500) {
    // 回收上次异常中断（进程崩溃等）遗留的 PENDING 记录，避免条目永久卡在"同步中"而不再被调度
    // 调度器已保证同一任务不会重入执行，因此此处全量重置是安全的
    const { rows: recoveredRows } = await subscribeRep.resetStalePendingVectorStatus();
    if (recoveredRows > 0) {
        __log.warn(`[Subject Schedule] Recovered ${recoveredRows} stale PENDING vector status rows for re-scheduling.`);
    }
    const readySubs = await subscribeRep.selectByVectorStatus(RSS_SUBSCRIBE_VECTOR_STATUS.READY, limited).then(res => res.data);
    const bangumiIds = readySubs.map(d => d.bangumiId);
    for (let i = 0; i < bangumiIds.length; i += BATCH_UPSERT_LIMITED) {
        if (jobSignal?.aborted) {
            __log.warn('[Subject Schedule] Backfill vector received abort signal, breaking loop gracefully.');
            break;
        }
        const batch = bangumiIds.slice(i, i + BATCH_UPSERT_LIMITED);
        await updateSubscribeVector(batch);
    }
}