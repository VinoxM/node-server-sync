import { generateUUID } from "../../common/stringUtil.js";
import authorsRep from "../../repository/media/authorsRep.js";
import categoriesRep from "../../repository/media/categoriesRep.js";
import tagsRep from "../../repository/media/tagsRep.js";
import videosRep from "../../repository/media/videosRep.js";
import videoTagMapRep from "../../repository/media/videoTagMapRep.js";
import videoMinioRep from "../../repository/media/videoMinioRep.js";
import { MEDIA_VIDEO_MINIO_TYPE, MEDIA_VIDEO_STATUS } from "../../constraints/mediaConst.js";
import { checkVideoFilterRulesByCategoryId } from "./mediaFilterHandler.js";
import { resolveVideoUri, updateVideoStatusByVideoMinioStatus } from './mediaMinioHandler.js';

const VIDEO_TAG_OPERATOR = ['update', 'add', 'del']

export async function searchVideos(body) {
    const { title, category: categoryId, author: authorId, currentPage = 1, pageSize = 20, tags = [] } = body
    const dataList = await videosRep.selectForSearch(title, categoryId, authorId, tags, currentPage, pageSize).then(({ data }) => data)
    const total = await videosRep.countForSearch(title, categoryId, authorId, tags)
    return {
        list: dataList,
        totalSize: total,
        currentPage,
        pageSize
    }
}

export async function checkVideoCanAdd({ category, author, uniqueId }) {
    const categoryExists = await categoriesRep.selectOneByName(category)
    if (!categoryExists) return { canAdd: false }
    const categoryId = categoryExists.id
    const toSave = await checkVideoFilterRulesByCategoryId(categoryId, author, uniqueId)
    if (!toSave) return { canAdd: false }
    const authorExists = await authorsRep.selectOneByName(author, categoryId)
    if (!authorExists) return { canAdd: true }
    const videoExists = await videosRep.selectForExists(categoryId, authorExists.id, uniqueId)
    return { canAdd: !videoExists }
}

/**
 * Add video step1
 * Video status: 
 * ANALYZING -> UPLOADING/PREPARED
 * Minio status:
 * PREPARED -> PREPARED/COMPLETE/FAILED
 */
export async function createVideo(videoObj) {
    const { title, author, category, uploadTime } = videoObj
    // validate category
    const categoryExists = await categoriesRep.selectOneByName(category)
    categoryExists || throwMessage('Category not exists.')
    const categoryId = categoryExists.id
    const uuid = generateUUID()
    let uniqueId = videoObj.uniqueId || uuid
    const toSave = await checkVideoFilterRulesByCategoryId(categoryId, author, uniqueId)
    // cannot to save
    toSave || throwMessage('Video filter rules denied.')
    // handle author
    const authorId = await addAuthor(author, categoryId)
    // handle tags
    const tagIds = await handleTags(videoObj.tags)
    const videoExists = await videosRep.selectForExists(categoryId, authorId, uniqueId)
    videoExists && throwMessage('Video exists.')
    // save video
    const { lastId: videoId } = await videosRep.insertOne({ uniqueId, title, authorId, categoryId, uploadTime, status: MEDIA_VIDEO_STATUS.ANALYZING })
    // save video tags mapping
    await videoTagMapRep.insertTags(videoId, tagIds)
    // handle video source
    await resolveVideoUri(videoObj.source, videoId, category, author, uuid, MEDIA_VIDEO_MINIO_TYPE.SOURCE)
    // handle video cover
    await resolveVideoUri(videoObj.cover, videoId, category, author, uuid, MEDIA_VIDEO_MINIO_TYPE.COVER)
    // update video status
    const videoStatus = await updateVideoStatusByVideoMinioStatus(videoId)
    return { id: videoId, status: videoStatus };
}

export async function updateVideoTitle(id, title) {
    const video = await videosRep.selectOne(id)
    video || throwMessage('Video not found')
    await videosRep.updateVideoTitle(id, title)
}

export async function updateVideoTags(videoId, tags, operator) {
    VIDEO_TAG_OPERATOR.includes(operator) || throwMessage('Invalid operator.')
    const video = await videosRep.selectOne(videoId)
    video || throwMessage('Video not found')
    const tagIds = await handleTags(tags)
    switch (operator) {
        case 'update':
            await videoTagMapRep.deleteTags(videoId)
            await videoTagMapRep.insertTags(videoId, tagIds)
            break;
        case 'add':
            await videoTagMapRep.insertTags(videoId, tagIds)
            break;
        case 'del':
            await videoTagMapRep.deleteTagsWithId(videoId, tagIds)
            break;
    }
}

/**
 * Can del:
 * Video status: PREPARED, COMPLETE
 */
const CAN_DELETE_VIDEO_STATUS = [MEDIA_VIDEO_STATUS.PREPARED, MEDIA_VIDEO_STATUS.COMPLETE]
export async function removeVideo(videoId) {
    const video = await videosRep.selectOne(videoId)
    video || throwMessage('Video not found.')
    CAN_DELETE_VIDEO_STATUS.includes(video.status) || throwMessage('Cannot remove video.')
    const minioExists = await videoMinioRep.selectMinioExistsByVideoId(videoId)
    minioExists && throwMessage('Cannot remove video, cause storage exists in this video.')
    await videosRep.deleteOne(videoId)
}

export async function addCategory(category) {
    const exists = await categoriesRep.selectOneByName(category)
    if (exists) {
        return exists.id
    }
    const { lastId } = await categoriesRep.insertOne(category)
    return lastId
}

export async function deleteCategory(categoryId) {
    const exists = await categoriesRep.selectOneById(categoryId)
    if (!exists) return;
    const videosExists = await categoriesRep.selectVideosExistsByCategoryId(categoryId)
    videosExists && throwMessage('Cannot delete category, cause videos exists in this category.')
    const policyExists = await categoriesRep.selectFilterRulesExistsByCategoryId(categoryId)
    policyExists && throwMessage('Cannot delete category, cause policy exists in this category.')
    await categoriesRep.deleteOne(categoryId)
}

export async function addAuthor(author, categoryId) {
    const { rows, lastId } = await authorsRep.insertOne(author, categoryId)
    if (rows === 0) {
        const exists = await authorsRep.selectOneByName(author, categoryId)
        return exists ? exists.id : (await authorsRep.insertOne(author, categoryId)).lastId
    }
    return lastId
}

export async function deleteAuthor(authorId) {
    const exists = await authorsRep.selectOneById(authorId)
    if (!exists) return;
    const videosExists = await authorsRep.selectVideosExistsByAuthorId(authorId)
    videosExists && throwMessage('Cannot delete author, cause videos exists in this author.')
    await authorsRep.deleteOne(authorId)
}

async function handleTags(tags) {
    const tagIds = []
    if (Array.isArray(tags)) {
        for (const tag of tags) {
            const tagId = await addTag(tag)
            tagIds.push(tagId)
        }
    }
    return tagIds
}

async function addTag(tag) {
    const exists = await tagsRep.selectOneByName(tag)
    if (exists) {
        return exists.id
    }
    const { lastId } = await tagsRep.insertOne(tag)
    return lastId
}
