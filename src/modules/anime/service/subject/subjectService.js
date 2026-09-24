import { getMinioClient } from "#core/instance/minioClient.js";
import {
    BANGUMI_IMAGES_STATUS, SUBJECT_HIDE_VALUE,
    SUBJECT_PLATFORM_DEFAULT, SUBJECT_PLATFORM_IS_SHORT
} from "#modules/anime/constants/subjectConstant.js";
import bangumiImagesRep from "#modules/anime/repository/bangumiImagesRep.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import subscribeRep from "#modules/anime/repository/subscribeRep.js";
import { backfillOriginUrl } from "#modules/anime/service/bangumi/bangumiDiffService.js";
import { generateCharacterImageLink } from "#modules/anime/service/bangumi/bangumiImagesService.js";
import { resetVectorStatusByBangumiIds } from "../rss/rssHybridVectorService.js";

/**
 * 获取数据库中已存在的所有番剧季度列表
 * @returns {Promise<string[]>} 季度列表 (如 `['2026-10', '2026-07']`)
 */
export async function getExistsSeasons() {
    return subjectsRep.selectAllSeasons().then(res => res.data.map(d => d.season));
}

/**
 * 将数据库原始番剧记录转换为前台视图展示对象（解析 JSON 字段、处理泡面番平台）
 * @param {Object} subject - 数据库原始番剧记录
 * @returns {Object} 视图展示对象
 */
export function handleSubjectView(subject) {
    if (!subject) return subject;
    const {
        subsId, nameAlias, platform, metaTags, staff, characters,
        hide, nsfw, updateTime, createTime, season, summaryMulti,
        ...rest
    } = subject;
    const isShort = platform === SUBJECT_PLATFORM_IS_SHORT;
    return {
        ...rest,
        season,
        subsId,
        nameAlias: JSON.parse(nameAlias || '[]'),
        platform: isShort ? SUBJECT_PLATFORM_DEFAULT : platform,
        metaTags: JSON.parse(metaTags || '[]'),
        staff: JSON.parse(staff || '[]'),
        characters: JSON.parse(characters || '[]'),
        summaryMulti: JSON.parse(summaryMulti || '{}'),
        isShort,
    };
}

/**
 * 将番剧记录转换为后台编辑界面视图对象（格式化放送时间及日历排序字段）
 * @param {Object} subject - 数据库原始番剧记录
 * @returns {Object} 编辑视图对象
 */
function handleSubjectViewForEdit(subject) {
    if (!subject) return subject;
    const subjectView = handleSubjectView(subject);
    const { nameAlias, staff, characters, metaTags, startTime, ...rest } = subjectView;

    const date = __isBlank(startTime) ? new Date(subject.season + '-01') : new Date(startTime);
    const startDate = `${date.getFullYear()}${(date.getMonth() + 1 + '').padStart(2, '0')}${(date.getDate() + '').padStart(2, '0')}`;
    let hours = date.getHours();
    if (hours >= 0 && hours < 6) {
        date.setDate(date.getDate() - 1);
        hours += 24;
    }
    const updateTime = `${String(hours).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
    const calendarTime = startDate + updateTime + date.getDay();
    return {
        ...rest,
        goon: subject.goon ?? 0,
        nsfw: subject.nsfw,
        fin: subject.fin,
        hide: subject.hide,
        calendarTime
    };
}

/**
 * 根据季度与名称模糊搜索番剧（后台编辑列表）
 * @param {string} season - 季度
 * @param {string} name - 番剧名称
 * @returns {Promise<Array<any>>}
 */
export async function searchSubjects(season, name) {
    const { data } = await subjectsRep.selectAllBySeasonAndName(season, name);
    return data.map(d => handleSubjectViewForEdit(d));
}

/**
 * 根据番剧 ID 和季度获取指定季度的编辑视图信息（若非连载且跨季度则返回 null）
 * @param {number|string} subjectId - 番剧 ID
 * @param {string} season - 当前季度
 * @returns {Promise<any|null>}
 */
export async function getSubjectForEditView(subjectId, season) {
    const subject = await subjectsRep.selectOneByIdAndSeason(subjectId, season);
    if (!subject.goon && season !== subject.season) {
        return null;
    }
    return handleSubjectViewForEdit(subject);
}

/**
 * 获取单条番剧编辑详情（回填封面与角色的原始网络图片地址）
 * @param {number|string} subjectId - 番剧 ID
 * @returns {Promise<any>}
 */
export async function getSubjectForEdit(subjectId) {
    const subject = await subjectsRep.selectOneById(subjectId);
    subject || __throwMessage('Subject not exists.');
    const subjectView = handleSubjectView(subject);
    const backfilledSubjectView = await backfillOriginUrl(subjectView, subject.bangumiId, { useExtractProp: true });
    return {
        ...backfilledSubjectView,
        nsfw: subject.nsfw,
        updateTime: subject.updateTime
    };
}

/**
 * 删除单个番剧条目并级联清理关联角色图片缓存
 * @param {number} id - 番剧主键 ID
 * @returns {Promise<void>}
 */
export async function deleteOneSubject(id) {
    const linkLikely = generateCharacterImageLink(id, '');
    const { rows, data } = await bangumiImagesRep.selectByLinkLikely(linkLikely);
    if (rows > 0) {
        const client = getMinioClient();
        client.ready() || __throwMessage('Delete subject\'s iamges failed. Cause storage client not ready.');
        const toDeleteIds = data.map(d => d.id);
        // 更新非上传中的图片缓存状态为删除中
        const prepareResult = await bangumiImagesRep.updateImageStatusBatch(toDeleteIds, BANGUMI_IMAGES_STATUS.REMOVING, BANGUMI_IMAGES_STATUS.PENDING, false);
        if (prepareResult.rows !== rows) {
            // 将状态为删除中的图片缓存状态改为删除失败
            await bangumiImagesRep.updateImageStatusBatch(toDeleteIds, BANGUMI_IMAGES_STATUS.REMOVE_FAILED, BANGUMI_IMAGES_STATUS.REMOVING);
            __throwMessage('Prepare to delete subject\'s images failed.');
        }
        const successRemovedIds = [];
        for (const { id, minioLink } of data) {
            const successful = await client.deleteObject(minioLink, err => __log.error(`[Subject Image] Delete subject image[${id}] minio object [${minioLink}] failed. Cause:`, err));
            successful && successRemovedIds.push(id);
        }
        await bangumiImagesRep.deleteByIds(successRemovedIds);
        if (successRemovedIds.length !== rows) {
            // 将状态为删除中的图片缓存状态改为删除失败
            await bangumiImagesRep.updateImageStatusBatch(toDeleteIds, BANGUMI_IMAGES_STATUS.REMOVE_FAILED, BANGUMI_IMAGES_STATUS.REMOVING);
            __throwMessage(`Delete subject failed. Cause delete any subject's images failed.`);
        }
    }
    await subjectsRep.deleteOneById(id);
}

/**
 * 更新番剧条目的所属季节
 * @param {number} id - 番剧 ID
 * @param {string} season - 目标季节
 * @returns {Promise<boolean>}
 */
export async function updateSubjectSeason(id, season) {
    const { rows } = await subjectsRep.updateSeasonById(season, id);
    return rows > 0;
}

/**
 * 更新番剧条目在前台的隐藏/显示状态
 * @param {number} id - 番剧 ID
 * @param {number} hide - 目标隐藏值 (SUBJECT_HIDE_VALUE: 0|1)
 * @returns {Promise<number>} 更新后的隐藏值
 */
export async function updateSubjectHide(id, hide) {
    Object.values(SUBJECT_HIDE_VALUE).includes(hide) || __throwMessage('Invalid hide value.');
    const subject = await subjectsRep.selectOneById(id);
    subject || __throwMessage('Subject not exists.');
    const { hide: originHide } = subject;
    const { rows } = await subjectsRep.updateSubjectHide(hide, id, originHide);
    return rows > 0 ? hide : originHide;
}

/**
 * 更新番剧条目是否是泡面番
 * @param {number} id - 番剧 ID
 * @param {number} short - 目标值
 * @returns {Promise<boolean>}
 */
export async function updateSubjectIsShort(id, short) {
    const subject = await subjectsRep.selectOneById(id);
    subject || __throwMessage('Subject not exists.');
    const { platform: originPlatform } = subject;
    [SUBJECT_PLATFORM_DEFAULT, SUBJECT_PLATFORM_IS_SHORT].includes(originPlatform) || __throwMessage('Cannot update subscribe isShort.');
    const platform = short ? SUBJECT_PLATFORM_IS_SHORT : SUBJECT_PLATFORM_DEFAULT;
    const { rows } = await subjectsRep.updateSubjectPlatform(platform, id);
    return rows > 0;
}

/**
 * 更新番剧条目是否已完结
 * @param {number} id - 番剧 ID
 * @param {number} fin - 目标值
 * @returns {Promise<void>}
 */
export async function updateSubjectFin(id, fin) {
    const subject = await subjectsRep.selectOneById(id);
    subject || __throwMessage('Subject not exists.');
    const { bangumiId } = subject;
    const { rows } = await subscribeRep.updateFinByBangumiId(bangumiId, fin);
    rows === 0 && __throwMessage('Subject subscribe not exists.');
}

/**
 * 更新番剧条目描述
 * @param {number} id - 番剧 ID
 * @param {object} summaryMulti - 目标值
 * @returns {Promise<void>}
 */
export async function updateSubjectSummaryMulti(id, summaryMulti) {
    const cn = summaryMulti?.cn || '';
    const jp = summaryMulti?.jp || '';
    const subject = await subjectsRep.selectOneById(id);
    subject || __throwMessage('Subject not exists.');
    const { bangumiId, summaryMulti: dbSummaryMulti } = subject;
    const cnDb = dbSummaryMulti?.cn || '';
    const jpDb = dbSummaryMulti?.jp || '';
    const cnEq = String(cn).trim() === String(cnDb).trim();
    const jpEq = String(jp).trim() === String(jpDb).trim();
    if (cnEq && jpEq) return;
    const summaryMultiStr = __isAllBlank(cn, jp) ? null : JSON.stringify({ cn, jp });
    const { rows } = await subjectsRep.updateOne({ bangumiId, summaryMulti: summaryMultiStr }, ['summary_multi']);
    rows && await resetVectorStatusByBangumiIds([bangumiId]);
}