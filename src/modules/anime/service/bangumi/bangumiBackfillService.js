import { detectLanguage, tryTranslateJaToZh } from "#agent";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import { getSummaryCNFromSummary } from "../subject/subjectCleanService.js";

/**
 * 批量回填指定 Bangumi ID 条目的中文简介
 * @param {Array<any>} subjects - 要处理的条目列表
 * @param {AbortSignal} [jobSignal] - 中断信号
 * @returns {Promise<void>}
 */
export async function backfillSubjectsSummaryCN(bangumiIds, jobSignal) {
    if (__isEmptyArray(bangumiIds)) return;
    const { data: subjects } = await subjectsRep.selectByBangumiIds(bangumiIds);
    if (subjects.length === 0) return;
    __log.info(`[Subject Backfill] Ready to backfill subjects:`, subjects.length);
    const toUpdateSubjects = [];
    for (const { bangumiId, summary, summaryCN } of subjects) {        
        if (jobSignal?.aborted) {
            __log.warn('[Subject Backfill] Backfill summaryCN received abort signal, breaking loop gracefully.');
            break;
        }
        if (__isNotBlank(summary) && __isBlank(summaryCN)) {
            const summaryObj = getSummaryCNFromSummary(summary);
            if (__isNotBlank(summaryObj.summaryCN)) {
                toUpdateSubjects.push({ bangumiId, ...summaryObj });
            } else {
                const detected = await detectLanguage(summary);
                if (detected.language.includes('日')) {
                    const translated = await tryTranslateJaToZh(summary);
                    if (__isNotBlank(translated)) {
                        __log.debug(`[Subject Backfill] Bangumi[${bangumiId}] summary jp, translated zh-cn, backfill to summaryCN.`);
                        toUpdateSubjects.push({ bangumiId, summary, summaryCN: translated });
                    }
                } else if (detected.language.includes('中')) {
                    __log.debug(`[Subject Backfill] Bangumi[${bangumiId}] summary already zh-cn, replace summaryCN.`);
                    toUpdateSubjects.push({ bangumiId, summary, summaryCN: summary });
                } else {
                    __log.warn(`[Subject Backfill] Bangumi[${bangumiId}] detected summary language failed. Origin:\n${summary}\nDetected:\n`, detected);
                }
            }
        }
    }
    if (__isNotEmptyArray(toUpdateSubjects)) {
        await subjectsRep.updateBatch(toUpdateSubjects, ['summary', 'summary_cn']);
    }
    __log.info(`[Subject Backfill] Backfill subjects complete, total: ${subjects.length}, handled: ${toUpdateSubjects.length}`);
}