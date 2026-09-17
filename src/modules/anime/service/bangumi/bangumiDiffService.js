import { getCurSeason } from "#common/utils/dateUtil.js";
import { convertPropertiesToCloumns, NEED_TO_RESET_VECTOR_STATUS_COLUMN } from "#modules/anime/entity/subjectResultMap.js";
import bangumiImagesRep from "#modules/anime/repository/bangumiImagesRep.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import { fetchAndCleanBangumiSubject } from "#modules/anime/service/subject/subjectPullService.js";
import { handleSubjectView } from "#modules/anime/service/subject/subjectService.js";
import { putImageStorageLinkBatch } from "#modules/anime/service/bangumi/bangumiImagesService.js";
import { resetVectorStatusByBangumiIds } from "#modules/anime/service/rss/rssSubscribeService.js";

/**
 * 差异对比并更新当前季度未完结的动画条目
 * @returns {Promise<{ totalCount: number, handleCount: number }|undefined>}
 */
export async function updateNotFinSubjects() {
    const curSeason = getCurSeason().join('-');
    const { rows: totalCount, data: subjects } = await subjectsRep.selectNotFinSubjectsForDiff(curSeason);
    if (totalCount === 0) return;
    __log.info(`[Bangumi Difference] Get not fin subjects:`, totalCount);
    let handleCount = 0;
    for (const subject of subjects) {
        const handled = await diffAndUpsertSubject(subject);
        handleCount += handled ? 1 : 0;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    __log.info(`[Bangumi Difference] Upsert not fin subjects: ${handleCount}, total: ${totalCount}`);
    return { totalCount, handleCount };
}

/**
 * 对比单个条目与 Bangumi 最新数据的差异，如有变更则触发更新
 * @param {Object} subject - 数据库现有条目对象
 * @returns {Promise<boolean>} 是否发生并执行了更新
 */
async function diffAndUpsertSubject(subject) {
    const { id, bangumiId, ...subjectView } = handleSubjectView(subject);
    const backfillSubject = await backfillOriginUrl(subjectView, bangumiId);
    const cleanedSubject = await fetchAndCleanBangumiSubject(bangumiId, { persistenceImage: false, collectImage: true, useOriginImage: true });
    const cleanedSubjectView = handleSubjectView(cleanedSubject);
    const diffs = getSubjectDiffProperties(backfillSubject, cleanedSubjectView);
    if (diffs.length === 0) return false;
    __log.info(`[Bangumi Difference] Subject[${id}] [${getName(subjectView.name, subjectView.nameCN)}] has ${diffs.length} diffs:`, diffs.join(', '));
    diffs.push('updateTime');
    const { rows } = await subjectsRep.updateOne(cleanedSubject, convertPropertiesToCloumns(diffs));
    if (diffs.some(s => NEED_TO_RESET_VECTOR_STATUS_COLUMN.includes(s)) && rows > 0) {
        await resetVectorStatusByBangumiIds([bangumiId]);
    }
    if (__isNotEmptyArray(cleanedSubject.images)) {
        await putImageStorageLinkBatch(cleanedSubject.images);
    }
    return true;
}

/**
 * 根据数据库中已存储的图片映射关系回填原始网络 URL
 * @param {Object} subject - 番剧视图对象
 * @param {number|string} bangumiId - Bangumi ID
 * @param {Object} [options={}] - 配置选项
 * @param {boolean} [options.useExtractProp=false] - 是否将原始 URL 赋给独立属性 (originCover / originImage)
 * @returns {Promise<Object>} 回填后的条目对象
 */
export async function backfillOriginUrl(subject, bangumiId, options = {}) {
    const { data } = await bangumiImagesRep.selectByLinkLikely(`/subject/${bangumiId}/`);
    const { characters } = subject;
    const { useExtractProp = false } = options;
    for (const { link, originUrl } of data) {
        if (link === subject.cover) {
            if (useExtractProp) {
                subject.originCover = originUrl;
            } else {
                subject.cover = originUrl;
            }
            continue;
        }
        const char = characters.find(o => o.image === link);
        if (char) {
            if (useExtractProp) {
                char.originImage = originUrl;
            } else {
                char.image = originUrl;
            }
        }
    }
    return subject;
}

/**
 * 对比数据库条目与最新 Bangumi 条目对象的属性差异
 * @param {Object} databaseSubject - 数据库中的条目数据
 * @param {Object} bangumiSubject - 从 Bangumi 拉取并清洗的最新条目数据
 * @returns {string[]} 发生变动的字段名称列表
 */
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

/**
 * 获取用于日志展示的番剧名称（优先中文名）
 * @param {string} name - 原名
 * @param {string} [nameCN] - 中文译名
 * @returns {string}
 */
function getName(name, nameCN) {
    return __isBlank(nameCN) ? name : nameCN;
}

/**
 * 字符串标准化（去空格）
 * @param {any} val
 * @returns {string}
 */
function normalizeStr(val) {
    return __isNotBlank(val) ? String(val).trim() : '';
}

/**
 * 多行文本标准化（统一换行符并去前后空格）
 * @param {any} val
 * @returns {string}
 */
function normalizeMultilineStr(val) {
    return normalizeStr(val).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * 集数格式标准化
 * @param {any} val
 * @returns {string}
 */
function normalizeEpisodes(val) {
    if (__isBlank(val)) {
        return '';
    }
    const n = Number(val);
    return isNaN(n) ? String(val).trim() : String(n);
}

/**
 * 数组标准化为排序后的 JSON 字符串
 * @param {any} arr
 * @returns {string}
 */
function normalizeArray(arr) {
    if (!Array.isArray(arr)) return '';
    return JSON.stringify([...arr].map(x => String(x).trim()).filter(Boolean).sort());
}

/**
 * Staff 制作人员列表标准化为排序后的 JSON 字符串
 * @param {Array<{ key: string, value: string|string[] }>} staff
 * @returns {string}
 */
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

/**
 * 角色立绘及声优信息标准化为排序后的 JSON 字符串
 * @param {Array<{ name: string, image: string, relation: string, summary: string, actors: any[] }>} chars
 * @returns {string}
 */
function normalizeCharacters(chars) {
    if (!Array.isArray(chars)) return '';
    return JSON.stringify(
        chars.map(c => ({
            name: normalizeStr(c.name),
            image: normalizeStr(c.image),
            relation: normalizeStr(c.relation),
            summary: normalizeMultilineStr(c.summary),
            actors: Array.isArray(c.actors) ? c.actors.map(a => normalizeStr(a.name || a)).sort() : []
        })).sort((a, b) => a.name.localeCompare(b.name))
    );
}