import { bangumiApi } from "../bangumi/bangumiApiService.js";

/**
 * Fetches subjects from Bangumi Search API within an air date range.
 * 
 * @param {[string, string]} airDateRange - Array of [startDate, endDate] (e.g., ['2026-07-01', '2026-10-01'])
 * @param {object} [options] - Optional configurations
 * @param {number} [options.limit=50] - Number of subjects per request
 * @param {string} [options.userAgent] - Custom User-Agent header
 * @param {string} [options.token] - Bangumi Access Token
 * @param {number} [options.delayMs=500] - Delay in milliseconds between page requests to avoid rate limits
 * @returns {Promise<Array<object>>} Array of fetched subjects
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