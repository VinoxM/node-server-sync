import { bangumiApi } from "../bangumi/bangumiApiService.js";

/**
 * 根据指定放送日期范围循环分页拉取 Bangumi 动画条目列表
 * 
 * @param {[string, string]} airDateRange - 起止日期范围元组（如 `['2026-07-01', '2026-10-01']`）
 * @param {object} [options] - 配置选项
 * @param {number} [options.limit=50] - 单次拉取条目数
 * @param {number} [options.delayMs=500] - 请求间隔延时 (毫秒)
 * @returns {Promise<Array<object>>} 拉取到的原始条目列表
 */
export async function fetchSubjectsByAirDate(airDateRange, options = {}) {
    if (!Array.isArray(airDateRange) || airDateRange.length !== 2) {
        throw new Error('airDateRange must be an array containing a start date and an end date, e.g. ["2026-07-01", "2026-10-01"]');
    }

    const [startDate, endDate] = airDateRange;
    const limit = options.limit || 50;
    const delayMs = options.delayMs ?? 500;

    let offset = 0;
    let allSubjects = [];
    let total = Infinity;

    __log.info(`[SubjectFetch] Querying range [${startDate}, ${endDate}) from Bangumi...`);

    while (offset < total) {        
        __log.debug(`[SubjectFetch] Requesting offset ${offset} (limit ${limit})...`);
        
        const result = await bangumiApi.searchSubjects([startDate, endDate], offset, limit);

        if (result === null) {
            __log.error(`[SubjectFetch] Failed to fetch subjects for range [${startDate}, ${endDate})`);
            throw new Error('Failed to fetch subjects from Bangumi API');
        }

        const data = result.data || [];
        allSubjects.push(...data);

        if (typeof result.total === 'number') {
            total = result.total;
        } else {
            total = allSubjects.length;
        }

        __log.debug(`[SubjectFetch] Retrieved ${data.length} subjects (Total accumulated: ${allSubjects.length}/${total})`);

        if (data.length === 0 || allSubjects.length >= total) {
            break;
        }

        offset += data.length;

        if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    __log.info(`[SubjectFetch] Completed fetching ${allSubjects.length} subjects.`);
    return allSubjects;
}