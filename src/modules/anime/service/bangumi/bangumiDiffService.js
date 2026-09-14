import { getCurSeason } from "#common/utils/dateUtil.js";
import { convertPropertiesToCloumns } from "#modules/anime/entity/subjectResultMap.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import { fetchAndCleanBangumiSubject } from "../subject/subjectPullService.js";
import { handleSubjectView } from "../subject/subjectService.js";
import { putImageStorageLinkBatch } from "./bangumiImagesService.js";

export async function updateNotFinSubjects() {
    const curSeason = getCurSeason().join('-');
    const { rows: totalCount, data: subjects } = await subjectsRep.selectNotFinSubjectsForDiff(curSeason);
    if (totalCount === 0) return;
    __log.info(`[Bangumi Difference] Get not fin subjects:`, totalCount);
    let handleCount = 0;
    for (const subject of subjects) {
        const handled = await diffAndUpsertSubject(subject);
        handleCount += handled ? 1 : 0;
    }
    __log.info(`[Bangumi Difference] Upsert not fin subjects: ${handleCount}, total: ${totalCount}`);
    return { totalCount, handleCount };
}

async function diffAndUpsertSubject(subject) {
    const { id, bangumiId, ...subjectView } = handleSubjectView(subject);
    const cleanedSubject = await fetchAndCleanBangumiSubject(bangumiId, { persistenceImage: false });
    const cleanedSUbjectView = handleSubjectView(cleanedSubject)
    const diffs = getSubjectDiffProperties(subjectView, cleanedSUbjectView);
    if (diffs.length === 0) return false;
    __log.info(`[Bangumi Difference] Subject[${id}] [${getName(subjectView.name, subjectView.nameCN)}] has ${diffs.length} diffs:`, diffs.join(', '));
    diffs.push('updateTime');
    await subjectsRep.updateOne(cleanedSubject, convertPropertiesToCloumns(diffs));
    if (__isNotEmptyArray(cleanedSubject.images)) {
        await putImageStorageLinkBatch(cleanedSubject.images);
    }
    return true;
}

function getSubjectDiffProperties(databaseSubject, bangumiSubject) {
    const diffs = [];
    const bgm = bangumiSubject;
    const db = databaseSubject;
    if (normalizeStr(db.name) !== normalizeStr(bgm.name)) diffs.push('name');
    if (normalizeStr(db.nameCN) !== normalizeStr(bgm.nameCN)) diffs.push('nameCN');
    if (normalizeArray(db.nameAlias) !== normalizeArray(bgm.nameAlias)) diffs.push('nameAlias');
    if (normalizeStr(db.platform) !== normalizeStr(bgm.platform)) diffs.push('platform');
    if (normalizeStr(db.airDate) !== normalizeStr(bgm.airDate)) diffs.push('airDate');
    if (normalizeMultilineStr(db.summary) !== normalizeMultilineStr(bgm.summary)) diffs.push('summary');
    if (normalizeEpisodes(db.totalEpisodes) !== normalizeEpisodes(bgm.totalEpisodes)) diffs.push('totalEpisodes');
    if (normalizeArray(db.metaTags) !== normalizeArray(bgm.metaTags)) diffs.push('metaTags');
    if (normalizeStaff(db.staff) !== normalizeStaff(bgm.staff)) diffs.push('staff');
    if (normalizeCharacters(db.characters) !== normalizeCharacters(bgm.characters)) diffs.push('characters');
    return diffs;
}

function getName(name, nameCN) {
    return __isBlank(nameCN) ? name : nameCN;
}

function normalizeStr(val) {
    return __isNotBlank(val) ? String(val).trim() : '';
}

function normalizeMultilineStr(val) {
    return normalizeStr(val).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function normalizeEpisodes(val) {
    if (__isBlank(val)) {
        return '';
    }
    const n = Number(val);
    return isNaN(n) ? String(val).trim() : String(n);
}

function normalizeArray(arr) {
    if (!Array.isArray(arr)) return '';
    return JSON.stringify([...arr].map(x => String(x).trim()).filter(Boolean).sort());
}

function normalizeStaff(staff) {
    if (!Array.isArray(staff)) return '';
    return JSON.stringify(
        staff.map(s => ({
            key: normalizeStr(s.key),
            value: Array.isArray(s.value)
                ? [...s.value].map(x => normalizeStr(x)).sort()
                : normalizeStr(s.value)
        })).sort((a, b) => a.key.localeCompare(b.key))
    );
}

function normalizeCharacters(chars) {
    if (!Array.isArray(chars)) return '';
    return JSON.stringify(
        chars.map(c => ({
            name: normalizeStr(c.name),
            relation: normalizeStr(c.relation),
            summary: normalizeMultilineStr(c.summary),
            actors: Array.isArray(c.actors) ? c.actors.map(a => normalizeStr(a.name || a)).sort() : []
        })).sort((a, b) => a.name.localeCompare(b.name))
    );
}