import { translateJaToZh } from "../../../common/utils/translateUtil.js";
import { GetterContextSubscribe } from "../../../core/context/subscribe.js";
import { MATCHERS, STAFF_TAG_CLEAN } from "../constants/subjectTagConstant.js";
import subjectsRep from "../repository/subjectsRep.js";
import { bangumiApi } from "./bangumiApiService.js";

function getQuarterStartMonth(month) {
    if (month >= 1 && month <= 3) return '01';
    if (month >= 4 && month <= 6) return '04';
    if (month >= 7 && month <= 9) return '07';
    if (month >= 10 && month <= 12) return '10';
    return null;
}

function getSeasonForSubject(subject) {
    if (!subject) return null;
    let tagSeason = null;
    if (Array.isArray(subject.tags)) {
        for (const tag of subject.tags) {
            if (tag && typeof tag.name === 'string') {
                const match = tag.name.match(/^(\d{4})年(\d{1,2})月$/);
                if (match) {
                    const year = match[1];
                    const rawMonth = parseInt(match[2], 10);
                    const seasonMonth = getQuarterStartMonth(rawMonth);
                    if (seasonMonth) {
                        tagSeason = `${year}-${seasonMonth}`;
                        break;
                    }
                }
            }
        }
    }
    let dateSeason = null;
    const dateStr = subject.date;
    if (dateStr && typeof dateStr === 'string') {
        const match = dateStr.match(/^(\d{4})-(\d{1,2})/);
        if (match) {
            const year = match[1];
            const month = parseInt(match[2], 10);
            const seasonMonth = getQuarterStartMonth(month);
            if (seasonMonth) {
                dateSeason = `${year}-${seasonMonth}`;
            }
        }
    }
    if (tagSeason && dateSeason) {
        if (tagSeason === dateSeason) {
            return tagSeason;
        }
        const actualTime = Date.parse(dateStr);
        const tagTime = Date.parse(`${tagSeason}-01`);
        const dateSeasonTime = Date.parse(`${dateSeason}-01`);
        if (!isNaN(actualTime) && !isNaN(tagTime) && !isNaN(dateSeasonTime)) {
            const diffTag = Math.abs(actualTime - tagTime);
            const diffDateSeason = Math.abs(actualTime - dateSeasonTime);
            return diffTag < diffDateSeason ? tagSeason : dateSeason;
        }
        return tagSeason;
    }
    return tagSeason || dateSeason || null;
}

const NAME_ALIAS_INCLUDES = ['别名']
function getAliasFromSubjectInfoBox(infoBox = []) {
    const results = []
    if (!infoBox || !Array.isArray(infoBox)) return results
    for (const info of infoBox) {
        if (NAME_ALIAS_INCLUDES.includes(info.key)) {
            if (Array.isArray(info.value)) {
                results.push(...info.value.map(o => o.v ?? o))
            } else {
                results.push(info.value)
            }
        }
    }
    return results
}

const staffFiltersGetter = new GetterContextSubscribe('SubjectStaffFilter', () => {
    const filters = []
    STAFF_TAG_CLEAN.forEach((v, i) => filters.push({ matchers: v.matchers, label: v.label, type: v.type || 'matchFirst' }))
    return filters
})

function getStaffFromSubjectInfoBox(infoBox = []) {
    const results = []
    if (!infoBox || !Array.isArray(infoBox)) return results
    const filters = staffFiltersGetter.getValue() || []
    for (const { matchers, label, type } of filters) {
        if (!matchers || !Array.isArray(matchers)) continue;
        const matcherFunc = MATCHERS[type]
        if (!matcherFunc || typeof matcherFunc !== 'function') continue;
        const result = matcherFunc(infoBox, matchers, label)
        result && results.push(result)
    }
    return results;
}

const CHARACTERS_RELATION_INCLUDES = ['主角', '配角']
async function getCharactersBySubjectId(subjectId) {
    const results = []
    const characters = await bangumiApi.getSubjectCharacters(subjectId);
    if (!characters || !Array.isArray(characters)) return results
    for (const character of characters) {
        if (!CHARACTERS_RELATION_INCLUDES.includes(character.relation)) continue;
        const summary = character.summary || '';
        const summaryCN = await translateJaToZh(summary)
        const result = {
            image: character?.images?.large || '',
            name: character.name || '',
            summary,
            summaryCN,
            relation: character.relation || '',
            actors: (character.actors ?? []).map(a => ({ name: a.name, image: a.images?.large || '' }))
        }
        results.push(result)
    }
    return results
}

export async function cleanBangumiSubject(subject) {
    if (!subject || !subject.id) return;
    const season = getSeasonForSubject(subject);
    if (!season) {
        __log.warn(`[Bangumi Clean] Subject[${subject.id}] cannot get season, skipped.`);
        return;
    }
    const infoBox = subject['infobox']
    const alias = getAliasFromSubjectInfoBox(infoBox);
    const staff = getStaffFromSubjectInfoBox(infoBox);
    const characters = await getCharactersBySubjectId(subject.id);
    const summaryCN = await translateJaToZh(subject.summary);
    const data = {
        bangumiId: subject.id,
        name: subject.name,
        nameCN: subject.name_cn,
        nameAlias: JSON.stringify(alias),
        platform: subject.platform,
        airDate: subject.date,
        summary: subject.summary,
        summaryCN,
        totalEpisodes: subject.total_episodes,
        cover: subject.images?.large || subject.image,
        metaTags: JSON.stringify(subject.meta_tags ?? []),
        staff: JSON.stringify(staff),
        characters: JSON.stringify(characters)
    }
    return { subject: data, season }
}
