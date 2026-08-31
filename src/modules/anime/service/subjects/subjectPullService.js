import { getCurSeason, getNextSeason } from "../../../../common/utils/dateUtil.js";
import { convertPropertiesToCloumns } from "../../entity/subjectResultMap.js";
import subjectsRep from "../../repository/subjectsRep.js";
import subscribeRep from "../../repository/subscribeRep.js";
import { cleanBangumiSubject } from "./subjectCleanService.js";
import { fetchSubjectsByAirDate } from "./subjectFetchService.js";

export async function fetchAnimeSubjects(dateRange, options) {
    __log.info(`[Subject Fetch] Ready to fetch anime subjects for date range: [${dateRange[0]}, ${dateRange[1]})`);
    const subjects = await fetchSubjectsByAirDate(dateRange, { limit: 20, delayMs: 500 });
    const cleanedSubjects = []
    for (const subject of subjects) {
        const cleanSubject = await cleanBangumiSubject(subject, options);
        cleanSubject && cleanedSubjects.push(cleanSubject)
    }
    __log.info(`[Subject Fetch] Fetched date range [${dateRange[0]}, ${dateRange[1]}) anime ${subjects.length} subjects.`)
    return cleanedSubjects;
}

export async function fetchCurrentSeasonAnime(options) {
    const [year, month] = getCurSeason();
    const startDate = `${year}-${month}-01`;
    const [nextYear, nextMonth] = getNextSeason();
    const endDate = `${nextYear}-${nextMonth}-01`;
    const dateRange = [startDate, endDate];
    return fetchAnimeSubjects(dateRange, options);
}

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

export async function upsertCleanedSubjects(subjects, options) {
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
        updatedRows = (await subjectsRep.updateBatch(updateSubjects, convertPropertiesToCloumns(updateProperties))).rows;
    }
    __log.info(`[Subject Upsert] Total: ${subjects.length}, Inserted ${insertedRows}, Updated ${updatedRows}`);
    return {
        inserted: insertedRows,
        updated: updatedRows
    };
}

export async function upsertOneCleanedSubject(subject, options) {
    const { updateProperties = [] } = options;
    const bangumiId = subject.bangumiId;
    const exists = await subjectsRep.selectExistsByBangumiId(bangumiId);
    if (!exists) {
        return subjectsRep.insertOne(subject);
    }
    return subjectsRep.updateOne(subject, convertPropertiesToCloumns(updateProperties));
}

async function insertSubjectSubscribes(subjects) {
    const subscribes = subjects.map(subject => {
        const { airDate, season, bangumiId } = subject;
        const startTime = __isNotBlank(airDate) ? new Date(airDate) : new Date(season + '-01');
        return { bangumiId, startTime }
    })
    const { rows } = await subscribeRep.insertBatch(subscribes)
    __log.info('[Subscribe insert] Inserted subscribe rows:', rows);
    return rows
}