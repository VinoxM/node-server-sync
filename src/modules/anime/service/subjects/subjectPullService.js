import { getCurSeason, getNextSeason } from "../../../../common/utils/dateUtil.js";
import subjectsRep from "../../repository/subjectsRep.js";
import subscribeRep from "../../repository/subscribeRep.js";
import { cleanBangumiSubject } from "./subjectCleanService.js";
import { fetchSubjectsByAirDate } from "./subjectFetchService.js";

export async function pullCurrentSeasonAnime(forceUpdate = false) {
    const [year, month] = getCurSeason();
    const startDate = `${year}-${month}-01`;
    const [nextYear, nextMonth] = getNextSeason();
    const endDate = `${nextYear}-${nextMonth}-01`;
    const dateRange = [startDate, endDate];
    const result = await pullAnimeSubjects(dateRange, forceUpdate);
    return result;
}

export async function pullAnimeSubjects(dateRange, forceUpdate = false) {
    __log.info(`[SubjectPull] Pulling anime subjects for date range: [${dateRange[0]}, ${dateRange[1]})`);
    const subjects = await fetchSubjectsByAirDate(dateRange, { limit: 20, delayMs: 500 });
    const cleanedSubjects = []
    for (const subject of subjects) {
        const cleanSubject = await cleanBangumiSubject(subject);
        cleanedSubjects.push(cleanSubject)
    }
    const { inserted, updated } = await upsertCleanedSubjects(cleanedSubjects, forceUpdate);
    __log.info(`[SubjectPull] Pulled date range [${dateRange[0]}, ${dateRange[1]}] anime subjects:`,
        `Fetched ${subjects.length}, Inserted ${inserted}, Updated ${updated}`);
    return {
        totalFetched: subjects.length,
        totalInserted: inserted,
        totalUpdated: updated
    };
}

async function upsertCleanedSubjects(subjects, forceUpdate = false) {
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
        updatedRows = (await subjectsRep.updateBatch(updateSubjects)).rows;        
    }
    const insertedSubscribeRows = await insertSubjectSubscribes(subjects);
    __log.info('[Subject upsert] Inserted subscribe rows:', insertedSubscribeRows)
    return {
        inserted: insertedRows,
        updated: updatedRows
    };
}

async function insertSubjectSubscribes(subjects) {
    const subscribes = subjects.map(subject => ({ bangumiId: subject.bangumiId, startTime: new Date(subject.airDate) }))
    const { rows } = await subscribeRep.insertBatch(subscribes)
    return rows
}