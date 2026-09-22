import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { SUBJECT_PLATFORM_DEFAULT, SUBJECT_PLATFORM_IS_SHORT } from "#modules/anime/constants/subjectConstant.js";
import { MATCHERS, STAFF_TAG_CLEAN } from "#modules/anime/constants/subjectTagConstant.js";
import { bangumiApi } from "#modules/anime/service/bangumi/bangumiApiService.js";
import {
    generateActorImageLink, generateCharacterImageLink,
    generateSubjectCoverLink, putImageStorageLinkBatch
} from "#modules/anime/service/bangumi/bangumiImagesService.js";

/**
 * 根据月份计算季度起始月份字符串 ('01', '04', '07', '10')
 * @param {number} month - 月份 (1-12)
 * @returns {string|null}
 */
function getQuarterStartMonth(month) {
    if (month >= 1 && month <= 3) return '01';
    if (month >= 4 && month <= 6) return '04';
    if (month >= 7 && month <= 9) return '07';
    if (month >= 10 && month <= 12) return '10';
    return null;
}

/**
 * 智能推断番剧所属的放送季度（如 '2026-10'），结合标签与实际开播日期比对
 * @param {Object} subject - Bangumi 条目对象
 * @returns {string|null}
 */
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

/**
 * 从 Bangumi Infobox 中提取番剧别名
 * @param {Array<{ key: string, value: any }>} [infoBox=[]] - Infobox 列表
 * @returns {string[]} 别名列表
 */
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

/**
 * Staff 过滤规则列表上下文订阅
 */
const staffFiltersGetter = new GetterContextSubscribe('SubjectStaffFilter', () => {
    const filters = [];
    STAFF_TAG_CLEAN.forEach((v) => filters.push({ matchers: v.matchers, label: v.label, type: v.type || 'matchFirst' }));
    return filters;
});

/**
 * 从 Bangumi Infobox 中提取结构化 Staff 信息（原作、导演、声优、动画制作等）
 * @param {Array<{ key: string, value: any }>} [infoBox=[]] - Infobox 列表
 * @returns {Array<{ key: string, value: string|string[] }>}
 */
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

/**
 * 根据标签与放送平台识别是否为泡面番
 * @param {Object} subject - 条目对象
 * @returns {string} 平台标识 (如 'TV', 'TV_Short', 'WEB', 'OVA' 等)
 */
function getPlatformFromSubject(subject) {
    const { platform, tags } = subject;
    if (tags.some(t => SHORT_ANIME_INCLUDES.includes(t.name)) && platform === SUBJECT_PLATFORM_DEFAULT) {
        return SUBJECT_PLATFORM_IS_SHORT;
    }
    return platform;
}

/**
 * 将 Bangumi 图片地址替换为大图缩略图地址
 * @param {string} image - 原始图片链接
 * @returns {string}
 */
function relaceCommonBangumiImageLink(image) {
    if (__isBlank(image)) return image;
    if (image.startsWith('https://lain.bgm.tv/pic/')) {
        return image.replace('https://lain.bgm.tv/pic/', 'https://lain.bgm.tv/r/400/pic/');
    }
    return image;
}

/**
 * 规范化收集图片链接及存储映射
 * @param {Array<import('#types/animeTypes.d.ts').CleanedSubjectImage>} images - 收集容器
 * @param {string} image - 原始网络图片链接
 * @param {string} link - 相对存储路径
 * @param {Object} [options={}] - 配置项
 * @param {boolean} [options.collectImage=true] - 是否收集到图片数组
 * @param {boolean} [options.useOriginImage=false] - 是否返回原始网络图片
 * @returns {string} 最终采用的链接
 */
function ensureImageStorageLink(images, image, link, options = {}) {
    if (__isAnyBlank(image, link)) return image;
    const { collectImage = true, useOriginImage = false } = options;
    const originImage = relaceCommonBangumiImageLink(image);
    collectImage && images.push({ image: originImage, link });
    return useOriginImage ? originImage : link;
}

const CHARACTERS_RELATION_INCLUDES = ['主角', '配角'];

/**
 * 拉取并清洗指定番剧的角色及声优列表与立绘图片
 * @param {number|string} subjectId - Bangumi 条目 ID
 * @param {Object} [options={}] - 配置选项
 * @param {number} [options.fetchDelay=500] - 延时
 * @returns {Promise<{ results: Array<any>, images: Array<import('#types/animeTypes.d.ts').CleanedSubjectImage> }>}
 */
async function getCharactersBySubjectId(subjectId, options = {}) {
    const { fetchDelay = 500 } = options;
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
        const characterImage = ensureImageStorageLink(images, character?.images?.large || '', generateCharacterImageLink(subjectId, character.id), options);
        const characterActors = character.actors ?? [];
        const actors = [];
        for (const actor of characterActors) {
            const actorImage = ensureImageStorageLink(images, actor?.images?.large || '', generateActorImageLink(actor.id), options);
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

const SUMMARY_CN_SPLIT_KEYWORDS = ['原文', '简介原文'];
export function getSummaryCNFromSummary(summary) {
    const result = { summary, summaryCN: null };
    if (__isNotBlank(summary)) {
        const lines = String(summary).split('\n');
        const index = lines.findIndex(line => SUMMARY_CN_SPLIT_KEYWORDS.some(s => line.includes(s)));
        if (index > -1) {
            const summaryJP = lines.slice(index + 1).join('\n').trim();
            const summaryCN = lines.slice(0, index).join('\n').trim();
            result.summary = summaryJP;
            result.summaryCN = summaryCN;
        }
    }
    return result;
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
    const { skipCharacter = false, collectImage = true, persistenceImage = true } = options;
    const infoBox = subject['infobox'];
    const alias = getAliasFromSubjectInfoBox(infoBox);
    const staff = getStaffFromSubjectInfoBox(infoBox);
    const platform = getPlatformFromSubject(subject);
    const metaTags = new Set(subject.meta_tags ?? []);
    const images = [];
    const characters = [];
    if (!skipCharacter) {
        const charactersResult = await getCharactersBySubjectId(subject.id, options);
        images.push(...charactersResult.images);
        characters.push(...charactersResult.results);
    }
    const cover = ensureImageStorageLink(images, subject.images?.large || subject.image, generateSubjectCoverLink(subject.id), options);
    const { summary, summaryCN } = getSummaryCNFromSummary(subject.summary);
    const result = {
        bangumiId: subject.id,
        name: subject.name,
        nameCN: subject.name_cn,
        nameAlias: JSON.stringify(alias),
        platform,
        airDate: subject.date,
        season,
        summary,
        summaryCN,
        totalEpisodes: subject.total_episodes,
        cover,
        metaTags: JSON.stringify(Array.from(metaTags)),
        staff: JSON.stringify(staff),
        characters: JSON.stringify(characters),
        nsfw: Boolean(subject.nsfw) ? 1 : 0
    };
    if (persistenceImage) {
        await putImageStorageLinkBatch(images);
    }
    if (collectImage) {
        result.images = images;
    }
    return result;
}
