import { SUBJECT_HIDE_VALUE } from "../constants/subjectConstant.js";
import bangumiImagesRep from "../repository/bangumiImagesRep.js";
import subjectsRep from "../repository/subjectsRep.js";
import { generateCharacterImageLink } from "./bangumi/bangumiImagesService.js";

/**
 * 删除单个番剧条目并级联清理关联角色图片缓存
 * @param {number} id - 番剧主键 ID
 * @returns {Promise<void>}
 */
export async function deleteOneSubject(id) {
    await subjectsRep.deleteOneById(id);
    const linkLikely = generateCharacterImageLink(id, '');
    await bangumiImagesRep.deleteByLinkLikely(linkLikely);
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