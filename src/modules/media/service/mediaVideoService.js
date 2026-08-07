import { generateUUID } from '../../../common/utils/cryptoUtil.js';
import authorsRep from "../repository/authorsRep.js";
import categoriesRep from "../repository/categoriesRep.js";
import tagsRep from "../repository/tagsRep.js";
import videosRep from "../repository/videosRep.js";
import videoTagMapRep from "../repository/videoTagMapRep.js";
import videoMinioRep from "../repository/videoMinioRep.js";
import { MEDIA_VIDEO_MINIO_TYPE, MEDIA_VIDEO_STATUS } from "../constants/mediaConst.js";
import { checkVideoFilterRulesByCategoryId } from "./mediaFilterService.js";
import { deleteVideoMinio, resolveStorageUriWithCreate, updateVideoStatusByVideoMinioStatus } from './mediaMinioService.js';
import { executeAsyncTaskChain } from '../../../core/infra/asyncSequence.js';
import { getDeleteAuthorSafely, getMediaUploadTimeoutOption } from './mediaOptionsService.js';
import favoritesRep from '../repository/favoritesRep.js';
import { Tracer } from '../../../core/infra/tracer.js';
import { addPlaylistVideoByTitle, removePlaylistByVideoId } from './mediaPlaylistService.js';

const VIDEO_TAG_OPERATOR = ['UPDATE', 'ADD', 'REMOVE']

export async function checkCategoryExistsByInside(categoryId, isInside) {
    const category = await categoriesRep.selectOneById(categoryId)
    if (!category || category.type !== isInside) {
        __throwMessage(`Invalid category.`)
    }
}

export async function searchVideos(body, isInside, userId) {
    const {
        title,
        category: categoryId,
        author: authorId,
        pageNum = 1, pageSize = 20,
        tags = [],
        status,
        needTotalSize,
        orderBy = {}
    } = body
    const videoStatus = Object.values(MEDIA_VIDEO_STATUS).includes(status) ? String(status) : null
    const record = await videosRep.selectForSearch(isInside, title, categoryId, authorId, tags, videoStatus, pageNum, pageSize, needTotalSize, userId, orderBy).then(({ data }) => data)
    const total = await videosRep.countForSearch(isInside, title, categoryId, authorId, tags, videoStatus)
    return { record, total, pageNum, pageSize }
}

export async function checkVideoCanAdd({ category, author, uniqueId = null }) {
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
export async function createVideo(videoObj, executeAsync = true) {
    const { title, author, category, uploadTime, playlistTitle } = videoObj
    // validate category
    const categoryExists = await categoriesRep.selectOneByName(category)
    categoryExists || __throwMessage('Category not exists.')
    const categoryId = categoryExists.id
    const uuid = generateUUID()
    let uniqueId = videoObj.uniqueId || uuid
    const toSave = await checkVideoFilterRulesByCategoryId(categoryId, author, uniqueId)
    // cannot to save
    toSave || __throwMessage('Video filter rules denied.')
    // handle author
    const authorId = await addAuthor(author, categoryId)
    // handle tags
    const tagIds = await handleTags(videoObj.tags)
    const videoExists = await videosRep.selectForExists(categoryId, authorId, uniqueId)
    videoExists && __throwMessage('Video exists.')
    // save video
    const { lastId: videoId } = await videosRep.insertOne({ uniqueId, title, authorId, categoryId, uploadTime, status: MEDIA_VIDEO_STATUS.ANALYZING })
    // save video tags mapping
    await videoTagMapRep.insertTags(videoId, tagIds)

    const tasks = []
    // resolve video cover
    const coverTask = await resolveStorageUriWithCreate(videoObj.cover, videoId, category, author, uuid, MEDIA_VIDEO_MINIO_TYPE.COVER)
    coverTask !== null && tasks.push(coverTask)
    // resolve video sources
    const sourceTasks = await resolveMultiStorage(videoObj.source, videoId, category, author, MEDIA_VIDEO_MINIO_TYPE.SOURCE)
    tasks.push(...sourceTasks)
    // resolve video barrages
    const barrageTasks = await resolveMultiStorage(videoObj.barrage, videoId, category, author, MEDIA_VIDEO_MINIO_TYPE.BARRAGE)
    tasks.push(...barrageTasks)

    if (tasks.length === 0) {
        // update video status
        await updateVideoStatusByVideoMinioStatus(videoId)
    } else {
        tasks.push(async () => updateVideoStatusByVideoMinioStatus(videoId))
        if (executeAsync) {
            // execute async task chain
            const uploadTimeout = await getMediaUploadTimeoutOption()
            await executeAsyncTaskChain(tasks, uploadTimeout)
        } else {
            for (const task of tasks) {
                await task();
            }
        }
    }
    if (__isNotBlank(playlistTitle)) {
        try {
            await addPlaylistVideoByTitle(videoId, playlistTitle)
        } catch (ex) {
            __log.warn(`Add video to playlist failed. Cause: `, ex.message ?? ex)
        }
    }
    return { id: videoId };
}

async function resolveMultiStorage(sourceValue, videoId, category, author, type) {
    const tasks = []
    const sources = []
    if (sourceValue && Array.isArray(sourceValue)) {
        sources.push(...sourceValue)
    } else if (__isNotBlank(sourceValue)) {
        sources.push(sourceValue)
    }
    if (sources.length > 0) {
        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            const isSourceStr = typeof source === 'string'
            const sourceUrl = isSourceStr ? source : source.url
            const sourceTitle = isSourceStr ? null : source.title
            const sourceTask = await resolveStorageUriWithCreate(sourceUrl, videoId, category, author, generateUUID(), type, i, sourceTitle)
            sourceTask !== null && tasks.push(sourceTask)
        }
    }
    return tasks
}

export async function updateVideoTitle(id, title) {
    const video = await videosRep.selectOne(id, true)
    video || __throwMessage('Video not found')
    await videosRep.updateVideoTitle(id, title)
}

export async function updateVideoTags(videoId, tags, operator) {
    VIDEO_TAG_OPERATOR.includes(operator) || __throwMessage('Invalid operator.')
    const video = await videosRep.selectOne(videoId, true)
    video || __throwMessage('Video not found')
    const tagIds = await handleTags(tags)
    switch (operator) {
        case 'UPDATE':
            await videoTagMapRep.deleteTags(videoId)
            await videoTagMapRep.insertTags(videoId, tagIds)
            break;
        case 'ADD':
            await videoTagMapRep.insertTags(videoId, tagIds)
            break;
        case 'REMOVE':
            await videoTagMapRep.deleteTagsWithId(videoId, tagIds)
            break;
    }
}

/**
 * Can del:
 * Video status: PREPARED, COMPLETE, REMOVED
 */
const CAN_DELETE_VIDEO_STATUS = [
    MEDIA_VIDEO_STATUS.PREPARED,
    MEDIA_VIDEO_STATUS.COMPLETE,
    MEDIA_VIDEO_STATUS.REMOVED
]
export async function removeVideo(videoId) {
    const video = await videosRep.selectOne(videoId)
    video || __throwMessage('Video not found.')
    CAN_DELETE_VIDEO_STATUS.includes(video.status) || __throwMessage('Cannot remove video.')
    const minioExists = await videoMinioRep.selectUploadingMinioExistsByVideoId(videoId)
    minioExists && __throwMessage('Cannot remove video, cause uploading storage exists in this video.')
    await videosRep.updateVideoRemoved(videoId)
    const minioList = await videoMinioRep.selectByVideoId(videoId).then(({ data }) => data)
    for (const { id } of minioList) {
        await deleteVideoMinio(id, true)
    }
    await videosRep.deleteOne(videoId)
    await videoTagMapRep.deleteTags(videoId)
    await favoritesRep.deleteByVideoId(videoId)
    await removePlaylistByVideoId(videoId)
}

export async function removeVideoBatch(videoIds) {
    for (const videoId of videoIds) {
        try {
            await removeVideo(videoId)
        } catch (error) {
            Tracer.tryStreamMessage(error.message, 'message:error')
        }
    }
}

/**
 * Category
 */
export async function addCategory(category, inside) {
    const exists = await categoriesRep.selectOneByName(category)
    if (exists) {
        return exists.id
    }
    const { lastId } = await categoriesRep.insertOne(category, inside)
    return lastId
}

export async function deleteCategory(categoryId) {
    const exists = await categoriesRep.selectOneById(categoryId)
    if (!exists) return;
    const videosExists = await categoriesRep.selectVideosExistsByCategoryId(categoryId)
    videosExists && __throwMessage('Cannot delete category, cause videos exists in this category.')
    const authorExists = await categoriesRep.selectAuthorsExistsByCategoryId(categoryId)
    authorExists && __throwMessage('Cannot delete category, cause authors exists in this category.')
    const policyExists = await categoriesRep.selectFilterRulesExistsByCategoryId(categoryId)
    policyExists && __throwMessage('Cannot delete category, cause policy exists in this category.')
    await categoriesRep.deleteOne(categoryId)
}

/**
 * Author
 */
export async function addAuthor(author, categoryId) {
    const { rows, lastId } = await authorsRep.insertOne(author, categoryId)
    if (rows === 0) {
        const exists = await authorsRep.selectOneByName(author, categoryId)
        return exists ? exists.id : (await authorsRep.insertOne(author, categoryId)).lastId
    }
    return lastId
}

export async function deleteAuthor(authorId) {
    const safely = await getDeleteAuthorSafely()
    if (safely) {
        const videosExists = await authorsRep.selectVideosExistsByAuthorId(authorId)
        videosExists && __throwMessage('Cannot delete author, cause videos exists in this author.')
    } else {
        const videoIds = await videosRep.selectAllByAuthor(authorId).then(res => (res.data || []).map(d => d.id))
        await removeVideoBatch(videoIds)
    }
    await authorsRep.deleteOne(authorId)
    await favoritesRep.deleteByAuthorId(authorId)
}

export async function cleanEmptyAuthor(categoryId) {
    await __sqliteDB.getTransactionDB(async db => {
        const authorIds = await authorsRep.selectEmptyVideoAuthors(categoryId, db).then(res => res.data)
        if (__isNotEmptyArray(authorIds)) {
            for (const { id: authorId } of authorIds) {
                await authorsRep.deleteOne(authorId, db)
                await favoritesRep.deleteByAuthorId(authorId, db)
            }
        }
    }, e => { throw e }, 'media')
}

/**
 * Tags
 */
async function handleTags(tags) {
    const tagIds = new Set();
    if (Array.isArray(tags)) {
        for (const tag of tags) {
            const tagId = await addTag(tag)
            tagIds.add(tagId)
        }
    }
    return Array.from(tagIds)
}

async function addTag(tag) {
    const exists = await tagsRep.selectOneByName(tag)
    if (exists) {
        return exists.id
    }
    const { lastId } = await tagsRep.insertOne(tag)
    return lastId
}
