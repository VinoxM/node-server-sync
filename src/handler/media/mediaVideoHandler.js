import path from 'path';
import { generateUUID } from "../../common/stringUtil.js";
import authorsRep from "../../repository/media/authorsRep.js";
import categoriesRep from "../../repository/media/categoriesRep.js";
import tagsRep from "../../repository/media/tagsRep.js";
import videosRep from "../../repository/media/videosRep.js";
import videoTagMapRep from "../../repository/media/videoTagMapRep.js";
import videoMinioRep from "../../repository/media/videoMinioRep.js";
import { MEDIA_MINIO_STATUS, MEDIA_TYPE_DESCRIPTION, MEDIA_VIDEO_MINIO_TYPE, MEDIA_VIDEO_STATUS } from "../../constraints/mediaConst.js";
import { addAria2Task } from "./mediaAria2Handler.js";
import { checkVideoFilterRulesByCategoryId } from "./mediaFilterHandler.js";
import { urlContentLengthLargeThanOneMB } from "../../common/httpUtil.js";
import { generateMinioLink, removeVideoMinio, updateVideoStatusByVideoMinioStatus, uploadFileToMinio, uploadUrlToMinio } from './mediaMinioHandler.js';
import { pushNotification } from '../../sockets/notification.js';

const FILE_PROTOCOL = ['file:']
const HTTP_PROTOCOL = ['http:', 'https:']
const VIDEO_TAG_OPERATOR = ['update', 'add', 'del']
const CAN_DELETE_VIDEO_STATUS = [MEDIA_VIDEO_STATUS.PREPARED, MEDIA_VIDEO_STATUS.COMPLETE]

export async function checkVideoCanAdd({ category, author, uniqueId }) {
    const categoryExists = await categoriesRep.selectOneByName(category)
    if (!categoryExists) return true
    const categoryId = categoryExists.id
    const toSave = await checkVideoFilterRulesByCategoryId(categoryId, author, uniqueId)
    if (!toSave) return false
    const authorExists = await authorsRep.selectOneByName(author, categoryId)
    if (!authorExists) return true
    const videoExists = await videosRep.selectForExists(categoryId, authorExists.id, uniqueId)
    return !videoExists
}

/**
 * Add video step1
 * Video status: 
 * ANALYSING -> UPLOADING/PREPARED
 * Minio status:
 * PREPARED -> PREPARED/COMPLETE/FAILED
 */
export async function addVideo(videoObj) {
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
    const { lastId: videoId } = await videosRep.insertOne({ uniqueId, title, authorId, categoryId, uploadTime, status: MEDIA_VIDEO_STATUS.ANALYSING })
    // save video tags mapping
    await videoTagMapRep.insertTags(videoId, tagIds)
    // handle video source
    const resolveSourceResult = await resolveVideoUri(videoObj.source, videoId, category, author, uuid, MEDIA_VIDEO_MINIO_TYPE.SOURCE)
    // hanlde video cover
    const resolveCoverResult = await resolveVideoUri(videoObj.cover, videoId, category, author, uuid, MEDIA_VIDEO_MINIO_TYPE.COVER)
    // update video status
    if (resolveSourceResult + resolveCoverResult > 0) {
        await videosRep.updateVideoStatus(videoId, MEDIA_VIDEO_STATUS.UPLOADING)
    } else {
        await updateVideoStatusByVideoMinioStatus(videoId)
    }
    return { videoId };
}

async function resolveVideoUri(uri = '', videoId, category, author, uuid, type) {
    let result = 0;
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type]
    const resolvedUri = generateUri(uri)
    if (resolvedUri === null) {
        __log.warn(`[${videoId}] Skipped resolve video ${typeDesc}, cause uri invalid. ${uri}`)
        return result;
    }
    // generate minioLink
    const ext = path.extname(resolvedUri.pathname)
    const minioLink = generateMinioLink(category, author, uuid, type, ext)
    // save minio
    const { rows, lastId } = await videoMinioRep.insertOne({ videoId, type, uri, link: minioLink, status: MEDIA_MINIO_STATUS.PREPARED })
    if (rows === 0) {
        __log.error(`Resolve video minio failed, cause unique(${videoId}, ${type}) exists.`)
        throwMessage(`Resolve video ${typeDesc} minio failed.`)
    }
    // update video minio id
    await videosRep.updateMinioIdById(videoId, lastId, type)
    const protocol = resolvedUri.protocol
    if (FILE_PROTOCOL.includes(protocol)) {
        // file protocol
        __log.info(`[${videoId}] Video's ${typeDesc} uri is a file, prepare move to minio: ${uri} -> ${minioLink}.`)
        await uploadFileToMinio(decodeURIComponent(resolvedUri.pathname), minioLink, lastId)
    } else if (HTTP_PROTOCOL.includes(protocol)) {
        // http protocol
        const overSizeOneMB = await urlContentLengthLargeThanOneMB(uri)
        // Get the url file size. 
        // If it cannot be obtained or is larger than 1MB, upload it to aria2 for download. 
        // Otherwise, upload it directly to minio.
        if (overSizeOneMB) {
            __log.info(`[${videoId}] Video's ${typeDesc} uri is a large size remote link, add aria2 task for download: ${uri} -> ${minioLink}.`)
            await addAria2Task(uri, lastId, type)
            await videoMinioRep.updateStatusById(lastId, MEDIA_MINIO_STATUS.DOWNLOADING)
            result = 1;
        } else {
            __log.info(`[${videoId}] Video's ${typeDesc} uri is a tiny remote link, upload uri to minio: ${uri} -> ${minioLink}.`)
            const complete = await uploadUrlToMinio(uri, minioLink, lastId)
            if (!complete) {
                __log.info(`[${videoId}] Video's ${typeDesc} upload to minio failed, add aria2 task for download: ${uri} -> ${minioLink}.`)
                await addAria2Task(uri, lastId, type)
                await videoMinioRep.updateStatusById(lastId, MEDIA_MINIO_STATUS.DOWNLOADING)
            }
        }
    } else {
        const message = `[${videoId}] Cannot resolve video ${typeDesc} uri: ${uri}`
        __log.warn(message)
        pushNotification(message)
    }
    return result;
}

export async function updateVideoTags(videoId, tags, oparetor) {
    VIDEO_TAG_OPERATOR.includes(oparetor) || throwMessage('Invalid operator.')
    const video = await videosRep.selectOne(videoId)
    video || throwMessage('Video not found')
    const tagIds = await handleTags(tags)
    switch (oparetor) {
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
export async function removeVideo(videoId) {
    const video = await videosRep.selectOne(videoId)
    video || throwMessage('Video not found.')
    CAN_DELETE_VIDEO_STATUS.includes(video.status) || throwMessage('Cannot remove video.')
    await videosRep.updateVideoStatus(videoId, MEDIA_VIDEO_STATUS.REMOVED)
    await removeVideoMinio(videoId)
}

export async function addCategory(category) {
    const exists = await categoriesRep.selectOneByName(category)
    if (exists) {
        return exists.id
    }
    const { lastId } = await categoriesRep.insertOne(category)
    return lastId
}

async function addAuthor(author, categoryId) {
    const exists = await authorsRep.selectOneByName(author, categoryId)
    if (exists) {
        return exists.id
    }
    const { lastId } = await authorsRep.insertOne(author, categoryId)
    return lastId
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

function generateUri(uri) {
    try {
        return new URL(uri)
    } catch (ignored) {
        return null
    }
}