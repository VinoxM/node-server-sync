import { SUBJECT_HIDE_VALUE } from "../constants/subjectConstant.js";
import bangumiImagesRep from "../repository/bangumiImagesRep.js";
import subjectsRep from "../repository/subjectsRep.js";
import { generateCharacterImageLink } from "./bangumi/bangumiImagesService.js";

export async function deleteOneSubject(id) {
    await subjectsRep.deleteOneById(id);
    const linkLikely = generateCharacterImageLink(id, '');
    await bangumiImagesRep.deleteByLinkLikely(linkLikely);
}

export async function updateSubjectHide(id, hide) {
    Object.values(SUBJECT_HIDE_VALUE).includes(hide) || __throwMessage('Invalid hide value.')
    const subject = await subjectsRep.selectOneById(id);
    subject || __throwMessage('Subject not exists.');
    const { hide: originHide } = subject;
    const { rows } = await subjectsRep.updateSubjectHide(hide, id, originHide);
    return rows > 0 ? hide : originHide;
}