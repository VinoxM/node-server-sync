import { getMinioClient } from "#core/instance/minioClient.js";
import { BANGUMI_IMAGES_STATUS, SUBJECT_HIDE_VALUE } from "#modules/anime/constants/subjectConstant.js";
import bangumiImagesRep from "#modules/anime/repository/bangumiImagesRep.js";
import subjectsRep from "#modules/anime/repository/subjectsRep.js";
import { generateCharacterImageLink } from "../bangumi/bangumiImagesService.js";

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

export async function getSubjectForEdit(subjectId) {
    const subject = await subjectsRep.selectOneById(subjectId);
    subject || __throwMessage('Subject not exists.');
    
}