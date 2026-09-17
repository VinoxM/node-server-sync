import { getCurSeason, getNextSeason } from "#utils/dateUtil.js";
import { convertPropertiesToCloumns } from "#modules/anime/entity/subjectResultMap.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import subscribeRep from "#modules/anime/repository/subscribeRep.js";
import { bangumiApi } from "#modules/anime/service/bangumi/bangumiApiService.js";
import { cleanBangumiSubject } from "#modules/anime/service/subject/subjectCleanService.js";
import { fetchSubjectsByAirDate } from "#modules/anime/service/subject/subjectFetchService.js";
import { SUBJECT_PLATFORM_DEFAULT, SUBJECT_PLATFORM_IS_SHORT } from "#modules/anime/constants/subjectConstant.js";
import { resetVectorStatusByBangumiIds } from "#modules/anime/service/rss/rssSubscribeService.js";

/**
 * @typedef {import('#types/animeTypes.d.ts').CleanedSubject} CleanedSubject
 * @typedef {import('#types/animeTypes.d.ts').SubjectPullOptions} SubjectPullOptions
 */

/**
 * 按 Bangumi ID 拉取并清洗动画条目
 * @param {number|string} bangumiId - 条目 ID
 * @param {SubjectPullOptions} [options] - 配置选项
 * @returns {Promise<CleanedSubject|undefined>}
 */
export async function fetchAndCleanBangumiSubject(bangumiId, options) {
    const subject = await bangumiApi.getSubject(bangumiId);
    return cleanBangumiSubject(subject, options);
}

/**
 * 按 Bangumi ID 拉取、清洗并单条同步入库指定条目
 * @param {number|string} bangumiId - 条目 ID
 * @param {Array<string>} [updateProperties] - 指定需要更新的字段列表
 * @returns {Promise<ExecResult>}
 */
export async function pullCleanedBangumiSubject(bangumiId, updateProperties) {
    const cleanedSubject = await fetchAndCleanBangumiSubject(bangumiId);
    return upsertOneCleanedSubject(cleanedSubject, { updateProperties });
}

/**
 * 按日期范围拉取并清洗动画条目列表
 * @param {[string, string]} dateRange - 起止日期范围
 * @param {SubjectPullOptions} [options] - 配置选项
 * @returns {Promise<Array<CleanedSubject>>}
 */
export async function fetchAnimeSubjects(dateRange, options) {
    __log.info(`[Subject Fetch] Ready to fetch anime subjects for date range: [${dateRange[0]}, ${dateRange[1]})`);
    const subjects = await fetchSubjectsByAirDate(dateRange, { limit: 20, delayMs: 500 });
    const cleanedSubjects = [];
    for (const subject of subjects) {
        const cleanSubject = await cleanBangumiSubject(subject, options);
        cleanSubject && cleanedSubjects.push(cleanSubject);
    }
    __log.info(`[Subject Fetch] Fetched date range [${dateRange[0]}, ${dateRange[1]}) anime ${subjects.length} subjects.`);
    return cleanedSubjects;
}

/**
 * 拉取当前季度的动画条目列表
 * @param {SubjectPullOptions} [options] - 配置选项
 * @returns {Promise<Array<CleanedSubject>>}
 */
export async function fetchCurrentSeasonAnime(options) {
    const [year, month] = getCurSeason();
    const startDate = `${year}-${month}-01`;
    const [nextYear, nextMonth] = getNextSeason();
    const endDate = `${nextYear}-${nextMonth}-01`;
    const dateRange = [startDate, endDate];
    return fetchAnimeSubjects(dateRange, options);
}

/**
 * 拉取指定日期范围的动画条目并同步入库/更新
 * @param {[string, string]} dateRange - 起止日期范围
 * @param {SubjectPullOptions} [options] - 导入配置
 * @returns {Promise<{ totalFetched: number, totalInserted: number, totalUpdated: number }>}
 */
export async function pullAnimeSubjects(dateRange, options) {
    const subjects = await fetchAnimeSubjects(dateRange, options);
    const { inserted, updated } = await upsertCleanedSubjects(subjects, options);
    if (options?.insertSubscribe) {
        await insertSubjectSubscribes(subjects);
    }
    return {
        totalFetched: subjects.length,
        totalInserted: inserted,
        totalUpdated: updated
    };
}

/**
 * 拉取当前季度的动画条目并同步入库/更新
 * @param {SubjectPullOptions} [options] - 导入配置
 * @returns {Promise<{ totalFetched: number, totalInserted: number, totalUpdated: number }>}
 */
export async function pullCurrentSeasonAnime(options) {
    const subjects = await fetchCurrentSeasonAnime();
    const { inserted, updated } = await upsertCleanedSubjects(subjects, options);
    if (options?.insertSubscribe) {
        await insertSubjectSubscribes(subjects);
    }
    return {
        totalFetched: subjects.length,
        totalInserted: inserted,
        totalUpdated: updated
    };
}

/**
 * 批量插入或更新已清洗的番剧列表
 * @param {Array<CleanedSubject>} subjects - 番剧列表
 * @param {SubjectPullOptions} [options={}] - 配置选项
 * @returns {Promise<{ inserted: number, updated: number }>}
 */
export async function upsertCleanedSubjects(subjects, options = {}) {
    const { forceUpdate, updateProperties } = options;
    const bangumiIds = subjects.map(subject => subject.bangumiId);
    const notExistingSubjectIds = await subjectsRep.selectNotExistsByBangumiIds(bangumiIds);
    const insertSubjects = [];
    const updateSubjects = [];
    for (const subject of subjects) {
        if (notExistingSubjectIds.includes(subject.bangumiId)) {
            insertSubjects.push(subject);
        } else {
            updateSubjects.push(subject);
        }
    }
    const { rows: insertedRows } = await subjectsRep.insertBatch(insertSubjects);
    let updatedRows = 0;
    if (forceUpdate) {
        updatedRows = (await subjectsRep.updateBatch(updateSubjects, handleUpdateProperties(updateProperties))).rows;
    }
    __log.info(`[Subject Upsert] Total: ${subjects.length}, Inserted ${insertedRows}, Updated ${updatedRows}`);
    if (updatedRows > 0) {
        const bangumiIds = updateSubjects.map(o => o.bangumiId);
        await resetVectorStatusByBangumiIds(bangumiIds);
    }
    return {
        inserted: insertedRows,
        updated: updatedRows
    };
}

/**
 * 插入或更新单条已清洗的番剧条目
 * @param {CleanedSubject} subject - 番剧条目
 * @param {SubjectPullOptions} [options={}] - 配置选项
 * @returns {Promise<ExecResult>}
 */
export async function upsertOneCleanedSubject(subject, options = {}) {
    const { updateProperties = [] } = options;
    const bangumiId = subject.bangumiId;
    const exists = await subjectsRep.selectExistsByBangumiId(bangumiId);
    if (!exists) {
        return subjectsRep.insertOne(subject);
    }
    return subjectsRep.updateOne(subject, handleUpdateProperties(updateProperties));
}

/**
 * 处理更新字段列表（自动追加 update_time 并映射为数据库列名）
 * @param {Array<string>} [updateProperties=[]]
 * @returns {Array<string>}
 */
function handleUpdateProperties(updateProperties = []) {
    if (updateProperties.length > 0 && !updateProperties.includes('update_time')) {
        updateProperties.push('update_time');
    }
    return convertPropertiesToCloumns(updateProperties);
}

const SUPPORTED_INSERT_SUBSCRIBE_SUJECT_PLATFORMS = [SUBJECT_PLATFORM_DEFAULT, SUBJECT_PLATFORM_IS_SHORT];

/**
 * 批量插入番剧对应的默认订阅记录
 * @param {Array<CleanedSubject>} subjects
 * @returns {Promise<number>} 插入条数
 */
async function insertSubjectSubscribes(subjects) {
    const subscribes = subjects.filter(subject => SUPPORTED_INSERT_SUBSCRIBE_SUJECT_PLATFORMS.includes(subject.platform))
        .map(subject => {
            const { airDate, season, bangumiId } = subject;
            const startTime = __isNotBlank(airDate) ? new Date(airDate) : new Date(season + '-01');
            return { bangumiId, startTime };
        });
    const { rows } = await subscribeRep.insertBatch(subscribes);
    __log.info('[Subscribe insert] Inserted subscribe rows:', rows);
    return rows;
}