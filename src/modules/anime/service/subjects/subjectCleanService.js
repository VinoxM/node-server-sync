import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { MATCHERS, STAFF_TAG_CLEAN } from "../../constants/subjectTagConstant.js";
import { bangumiApi } from "../bangumi/bangumiApiService.js";
import { generateActorImageLink, generateCharacterImageLink, generateSubjectCoverLink, putImageStorageLinkBatch } from "../bangumi/bangumiImagesService.js";

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

const NAME_ALIAS_INCLUDES = ['别名'];
function getAliasFromSubjectInfoBox(infoBox = []) {
    const results = [];
    if (!infoBox || !Array.isArray(infoBox)) return results;
    for (const info of infoBox) {
        if (NAME_ALIAS_INCLUDES.includes(info.key)) {
            if (Array.isArray(info.value)) {
                results.push(...info.value.map(o => o.v ?? o));
            } else {
                results.push(info.value);
            }
        }
    }
    return results;
}

const staffFiltersGetter = new GetterContextSubscribe('SubjectStaffFilter', () => {
    const filters = [];
    STAFF_TAG_CLEAN.forEach((v) => filters.push({ matchers: v.matchers, label: v.label, type: v.type || 'matchFirst' }));
    return filters;
});

function getStaffFromSubjectInfoBox(infoBox = []) {
    const results = [];
    if (!infoBox || !Array.isArray(infoBox)) return results;
    const filters = staffFiltersGetter.getValue() || [];
    for (const { matchers, label, type } of filters) {
        if (!matchers || !Array.isArray(matchers)) continue;
        const matcherFunc = MATCHERS[type];
        if (!matcherFunc || typeof matcherFunc !== 'function') continue;
        const result = matcherFunc(infoBox, matchers, label);
        result && results.push(result);
    }
    return results;
}

const SHORT_ANIME_INCLUDES = ['泡面', '泡面番'];
function getPlatformFromSubject(subject) {
    const { platform, tags } = subject;
    if (tags.some(t => SHORT_ANIME_INCLUDES.includes(t.name)) && platform === 'TV') {
        return 'TV_Short';
    }
    return platform;
}

function ensureImageStorageLink(images, image, link) {
    if (__isAnyBlank(image, link)) return image;
    images.push({ image, link });
    return link;
}

const CHARACTERS_RELATION_INCLUDES = ['主角', '配角'];
async function getCharactersBySubjectId(subjectId, fetchDelay = 500) {
    const results = [];
    const images = [];
    const characters = await bangumiApi.getSubjectCharacters(subjectId);
    if (!characters || !Array.isArray(characters)) {
        __log.warn(`[Bangumi Clean] Subject[${subjectId}] empty characters.`);
        return { results, images };
    }
    __log.info(`[Bangumi Clean] Subject[${subjectId}] get ${characters.length} characters.`);
    for (const character of characters) {
        if (!CHARACTERS_RELATION_INCLUDES.includes(character.relation)) continue;
        const summary = character.summary || '';
        const characterImage = ensureImageStorageLink(images, character?.images?.large || '', generateCharacterImageLink(subjectId, character.id));
        const characterActors = character.actors ?? [];
        const actors = [];
        for (const actor of characterActors) {
            const actorImage = ensureImageStorageLink(images, actor?.images?.large || '', generateActorImageLink(actor.id));
            actors.push({ name: actor.name, image: actorImage, id: actor.id });
        }
        const result = {
            id: character.id,
            image: characterImage,
            name: character.name || '',
            summary,
            relation: character.relation || '',
            actors
        };
        results.push(result);
        await Promise.resolve(resolve => setTimeout(resolve, fetchDelay));
    }
    return { results, images };
}

/**
 * 清洗 Bangumi 原始 API 条目数据为标准数据库入库结构
 * 包括计算所属季度、提取中文别名、解析制作人员 Staff、抓取主角配角与声优图片并入库图片转存表
 * @param {Object} subject - Bangumi 原始条目对象
 * @param {import('#types/animeTypes.d.ts').SubjectPullOptions} [options={}] - 配置选项
 * @returns {Promise<import('#types/animeTypes.d.ts').CleanedSubject|undefined>}
 */
export async function cleanBangumiSubject(subject, options = {}) {
    if (!subject || !subject.id) return;
    const season = getSeasonForSubject(subject);
    if (!season) {
        __log.warn(`[Bangumi Clean] Subject[${subject.id}] cannot get season, skipped.`);
        return;
    }
    const { fetchDelay, skipCharacter = false } = options;
    const infoBox = subject['infobox'];
    const alias = getAliasFromSubjectInfoBox(infoBox);
    const staff = getStaffFromSubjectInfoBox(infoBox);
    const platform = getPlatformFromSubject(subject);
    const images = [];
    const characters = [];
    if (!skipCharacter) {
        const charactersResult = await getCharactersBySubjectId(subject.id, fetchDelay);
        images.push(...charactersResult.images);
        characters.push(...charactersResult.results);
    }
    const cover = ensureImageStorageLink(images, subject.images?.large || subject.image, generateSubjectCoverLink(subject.id));
    await putImageStorageLinkBatch(images);
    return {
        bangumiId: subject.id,
        name: subject.name,
        nameCN: subject.name_cn,
        nameAlias: JSON.stringify(alias),
        platform,
        airDate: subject.date,
        season,
        summary: subject.summary,
        totalEpisodes: subject.total_episodes,
        cover,
        metaTags: JSON.stringify(subject.meta_tags ?? []),
        staff: JSON.stringify(staff),
        characters: JSON.stringify(characters),
        nsfw: Boolean(subject.nsfw) ? 1 : 0
    };
}
