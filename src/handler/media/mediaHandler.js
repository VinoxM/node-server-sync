import path from "path";
import { generateUUID } from "../../common/stringUtil.js";
import authorsRep from "../../repository/media/authorsRep.js";
import categoriesRep from "../../repository/media/categoriesRep.js";
import tagsRep from "../../repository/media/tagsRep.js";
import videosRep from "../../repository/media/videosRep.js";
import videoTagMapRep from "../../repository/media/videoTagMapRep.js";
import videoMinioRep from "../../repository/media/videoMinioRep.js";
import { MEDIA_MINIO_STATUS, MEDIA_VIDEO_STATUS } from "../../constraints/mediaStatus.js";
import { getExecutor } from "../sshHandler.js";
import { SSH_CMD_MINIO_COPY_SCRIPT, SSH_CMD_MINIO_DOWNLOAD_SCRIPT } from "../../constraints/sshScriptsConst.js";
import { getMinioClient } from "../../instance/minio.js";

export async function addVideo(videoObj) {
    const { title, author, category, tags, uploadTime, uri, cover } = videoObj
    const resolvedUri = generateUri(uri)
    resolvedUri === null && throwMessage('Invalid video uri.')
    let uniqueId = videoObj.uniqueId || generateUUID()
    const authorId = await addAuthor(author)
    const categoryId = await addCategory(category)
    const tagIds = []
    for (const tag of tags) {
        const tagId = await addTag(tag)
        tagIds.push(tagId)
    }
    let toSave = true
    toSave &&= await checkWhiteList(authorId, categoryId, uniqueId)
    toSave &&= await checkBlackList(authorId, categoryId, uniqueId)
    // cannot to save
    if (!toSave) return { videoId: -1 }
    // save video
    const { lastId: videoId } = await videosRep.insertOne({ uniqueId, title, authorId, categoryId, uploadTime, status: MEDIA_VIDEO_STATUS.PREPARED })
    await videoTagMapRep.insertTags(videoId, tagIds)

    // video minio
    const videoMinio = await handleMinio({ videoId, category, author, uniqueId }, uri, 1)

    // cover minio
    const coverMinio = await handleMinio({ videoId, category, author, uniqueId }, cover, 2)

    await videosRep.updateVideoStatus(videoId, MEDIA_VIDEO_STATUS.COMPLETE)
    return { videoId, videoMinio, coverMinio };
}

async function checkWhiteList(authorId, categoryId, uniqueId) {
    // todo
    return true;
}

async function checkBlackList(authorId, categoryId, uniqueId) {
    // todo
    return true;
}

async function handleMinio(video, uri, type) {
    const { videoId, category, author, uniqueId } = video
    const resolvedUri = isNotBlank(uri) ? generateUri(uri) : null
    if (resolvedUri) {
        const ext = getUriExt(resolvedUri, type === 1 ? '.mp4' : '.jpg')
        const minioLink = generateMinioLink(category, author, uniqueId, ext)
        await videoMinioRep.insertOne({ videoId, type, link: minioLink, status: MEDIA_MINIO_STATUS.PREPARED })
        const res = await uploadToMinio(uri, minioLink)
        await handleUploadResult(res, videoId, type, minioLink, uri)
        return res === 1 ? 'success' : 'failed'
    }
    return 'skipped'
}

async function uploadToMinio(uri, minioLink) {
    const resolvedUri = generateUri(uri)
    if (resolvedUri === null) return -1
    let resourcePath = ''
    let script = ''
    if (resolvedUri.protocol === 'file:') {
        resourcePath = decodeURIComponent(resolvedUri.pathname)
        script = SSH_CMD_MINIO_COPY_SCRIPT
    } else {
        resourcePath = uri
        script = SSH_CMD_MINIO_DOWNLOAD_SCRIPT
    }
    const executor = getExecutor('fedora')
    if (!executor) return -2
    try {
        const { code } = await executor.exec(script, [resourcePath, minioLink]);
        return parseInt(code)
    } catch (e) {
        __log.error('Execute ssh script failed.', e)
        return -3
    }
}

async function handleUploadResult(res, videoId, type, link, uri) {
    if (res === 1) {
        await videoMinioRep.updateStatus(videoId, type, MEDIA_MINIO_STATUS.COMPLETE)
    } else {
        await videoMinioRep.updateStatus(videoId, MEDIA_MINIO_STATUS.FAILED)
        await videoMinioRep.insertOneFailed({ videoId, type, link, uri, reason: res })
    }
}

function generateUri(uri) {
    try {
        return new URL(uri)
    } catch (ignored) {
        return null
    }
}

function getUriExt(uri, defaultExt = '') {
    try {
        return path.extname(uri.pathname)
    } catch (ignored) {
        return defaultExt
    }
}

function generateMinioLink(category, author, uniqueId, ext) {
    return `/media/${category}/${author}/${uniqueId}${ext}`
}

export async function delVideo(videoId) {
    const video = await videosRep.selectOne(videoId)
    if (video && video.status === 0) {
        throwMessage('Cannot delete video.')
    }
    const { rows } = await videosRep.deleteOne(videoId)
    if (rows > 0) {
        await videoTagMapRep.deleteTags(videoId)
        // todo detele minio resources
        const { data } = await videoMinioRep.selectByVideoId(videoId)
        if (data && Array.isArray(data)) {
            for (const { link, status } of data) {
                if (status === MEDIA_MINIO_STATUS.COMPLETE) {
                    const index = link.indexOf('/')
                    const bucket = link.substring(0, index)
                    const objectName = link.substring(index + 1)
                    await getMinioClient().deleteObject(bucket, objectName)
                }
            }
        }
        await videoMinioRep.deleteByVideoId(videoId)
        await videoMinioRep.deleteFailedByVideoId(videoId)
    }
    return { rows }
}

async function addAuthor(author) {
    const exists = await authorsRep.selectOneByName(author)
    if (exists) {
        return exists.id
    }
    const { lastId } = await authorsRep.insertOne(author)
    return lastId
}

async function addCategory(category) {
    const exists = await categoriesRep.selectOneByName(category)
    if (exists) {
        return exists.id
    }
    const { lastId } = await categoriesRep.insertOne(category)
    return lastId
}

async function addTag(tag) {
    const exists = await tagsRep.selectOneByName(tag)
    if (exists) {
        return exists.id
    }
    const { lastId } = await tagsRep.insertOne(tag)
    return lastId
}