import { tryDetectLanguage, tryTranslateJaToZh } from "#agent";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";

const SUMMARY_CN_SPLIT_KEYWORDS = ['原文', '简介原文'];
function detectSummary(summary) {
    const result = { jp: null, cn: null };
    if (__isNotBlank(summary)) {
        const lines = String(summary).split('\n');
        const index = lines.findIndex(line => SUMMARY_CN_SPLIT_KEYWORDS.some(s => line.includes(s)));
        if (index > -1) {
            const jp = lines.slice(index + 1).join('\n').trim();
            const cn = lines.slice(0, index).join('\n').trim();
            result.jp = jp;
            result.cn = cn;
        }
    }
    return result;
}

/**
 * 批量回填指定 Bangumi ID 条目的中文简介
 * @param {Array<any>} subjects - 要处理的条目列表
 * @param {AbortSignal} [jobSignal] - 中断信号
 * @returns {Promise<void>}
 */
export async function backfillSubjectsSummaryMulti(bangumiIds, jobSignal) {
    let updated = 0, handled = 0;
    if (__isEmptyArray(bangumiIds)) return { updated, handled };
    const { data: subjects } = await subjectsRep.selectByBangumiIds(bangumiIds);
    if (subjects.length === 0) return { updated, handled };
    __log.info(`[Subject Backfill] Ready to backfill subjects:`, subjects.length);
    for (const { bangumiId, summary } of subjects) {
        if (jobSignal?.aborted) {
            __log.warn('[Subject Backfill] Backfill summaryMulti received abort signal, breaking loop gracefully.');
            break;
        }
        if (__isNotBlank(summary)) {
            const summaryObj = detectSummary(summary);
            let toUpdateSubject = null;
            if (!__isAnyBlank(summaryObj.cn, summaryObj.jp)) {
                toUpdateSubject = { bangumiId, summaryMulti: JSON.stringify(summaryObj) };
            } else {
                const detected = await tryDetectLanguage(summary);
                if (detected?.language?.includes('日')) {
                    const translated = await tryTranslateJaToZh(summary);
                    if (__isNotBlank(translated)) {
                        __log.debug(`[Subject Backfill] Bangumi[${bangumiId}] summary jp, translated zh-cn, backfill to summary multi's cn.`);
                        toUpdateSubject = { bangumiId, summaryMulti: JSON.stringify({ cn: translated, jp: summary }) };
                    } else {
                        __log.error(`[Subject Backfill] Bangumi[${bangumiId}] summary translate failed. Plaintext:`, summary);
                    }
                } else if (detected?.language?.includes('中')) {
                    __log.debug(`[Subject Backfill] Bangumi[${bangumiId}] summary already zh-cn, replace summary multi's jp.`);
                    toUpdateSubject = { bangumiId, summaryMulti: JSON.stringify({ cn: summary, jp: null }) };
                } else {
                    __log.warn(`[Subject Backfill] Bangumi[${bangumiId}] detected summary language failed. Origin:\n${summary}\nDetected:\n`, detected);
                }
            }
            if (toUpdateSubject) {
                const { rows } = await subjectsRep.updateOne(toUpdateSubject, ['summary_multi']);
                updated += rows;
            }
        } else {
            const { rows } = await subjectsRep.updateOne({ bangumiId, summary: null, summaryMulti: null }, ['summary', 'summary_multi']);
            updated += rows;
        }
        handled++;
    }
    __log.info(`[Subject Backfill] Backfill subjects complete, total: ${subjects.length}, handled: ${updated}`);
    return { updated, handled };
}