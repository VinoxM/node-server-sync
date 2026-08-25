import { getMinioClient } from "../../../../core/instance/minioClient.js";
import { downloadFileToMinio } from "../../../ssh/sshExecutorService.js";
import { BANGUMI_IMAGES_STATUS, SUBJECT_MINIO_BUCKET } from "../../constants/subjectConstant.js";
import bangumiImagesRep from "../../repository/bangumiImagesRep.js";
import path from 'path';

export function generateActorImageLink(actorId) {
    return `/actor/${actorId}`
}

export function generateCharacterImageLink(subjectId, characterId) {
    return `/subject/${subjectId}/character/${characterId}`
}

export function generateSubjectCoverLink(subjectId) {
    return `/subject/${subjectId}/cover`
}

function tryImageType(image) {
    try {
        return path.extname(new URL(image).pathname)
    } catch {
        return '.jpg'
    }
}

export async function putImageStorageLinkBatch(images) {
    const dataList = images.map(({ image, link }) => ({
        link,
        minioLink: generateImageBucketLink(image, link),
        originUrl: image
    }))
    return bangumiImagesRep.insertBatch(dataList);
}

function generateImageBucketLink(image, link) {
    return '/' + SUBJECT_MINIO_BUCKET + link + tryImageType(image);
}

export async function putImageStorageLink(image, link) {
    if (__isAnyBlank(image, link)) return image;
    const bucketLink = generateImageBucketLink(image, link);
    await bangumiImagesRep.insertOne({ link, minioLink: bucketLink, originUrl: image });
    return link;
}

const PUSH_IMAGE_SCHEDULE_LIMIT = 500
export async function pushImageToStorageSchedule() {
    const { rows, data } = await bangumiImagesRep.selectPreparedImagesWithLimit(PUSH_IMAGE_SCHEDULE_LIMIT);
    if (rows === 0) return;
    __log.info(`[Bangumi Images] Found need to synchronize images:`, rows);
    const completeIds = new Set()
    const failedIds = new Set()
    for (const { id, originUrl, minioLink } of data) {
        const pending = await bangumiImagesRep.updatePreparedImagePending(id);
        if (pending.rows === 0) continue;
        const pushResult = await pushImageToStorage(originUrl, minioLink);
        pushResult ? completeIds.add(id) : failedIds.add(id);
    }
    if (completeIds.size > 0) {
        await bangumiImagesRep.updateImageStatusBatch(Array.from(completeIds), BANGUMI_IMAGES_STATUS.COMPLETE);
    }
    if (failedIds.size > 0) {
        await bangumiImagesRep.updateImageStatusBatch(Array.from(completeIds), BANGUMI_IMAGES_STATUS.PREPARED);
    }
    __log.info(`[Bangumi Images] Push image to storage success. Founded: ${rows}, Complete: ${completeIds.size}, Failed: ${failedIds.size}`);
}

async function pushImageToStorage(image, minioLink) {
    const client = getMinioClient();
    if (!client.ready()) return false;
    const suitableMinioLink = client.generateSuitableMinioLink(minioLink);
    if (__isBlank(suitableMinioLink)) return false;
    try {
        await client.getObjectStat(minioLink);
        return true;
    } catch (err) {
        if (err.code === 'NotFound' || err.statusCode === 404) {
            const code = await downloadFileToMinio(image, suitableMinioLink, { useProxy: true })
            return code === 0
        }
        __log.error(`[Bangumi Images] Get minio object stat failed. MinioLink: ${suitableMinioLink}, Cause:`, err.message || err);
    }
    return false;
}

async function getBangumiImages(link, res) {
    const result = await bangumiImagesRep.selectByLink(link);
    result || __throwMessage('Not found.', -404, 404);
    const client = getMinioClient();
    client.ready() || __throwMessage('Not found.', -404, 404);
    const minioLink = result.minioLink;
    try {
        const stat = await client.getObjectStat(minioLink);
        res.setHeader('Content-Type', stat.metaData['content-type'] || 'image/jpeg');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'public, max-age=2592000')
        const dataStream = await client.getObject(minioLink);
        dataStream.pipe(res);
        dataStream.on('error', (err) => {
            __log.error(`[Bangumi Image] Read minio object stream failed. Cause:`, err.message || err)
            if (!res.headersSent) {
                res.status(500).send('Server error.');
            }
        });
        res.__customPiped = true;
    } catch (err) {
        if (err.code === 'NotFound' || err.statusCode === 404) {
            __throwMessage('Not found.', -404, 404);
        }
        __log.error(`[Bangumi Image] Get minio object failed. Cause:`, err.message || err)
        __throwMessage('Not found.', -404, 404);
    }
}

export async function getActorImage(actorId, res) {
    const link = generateActorImageLink(actorId);
    await getBangumiImages(link, res)
}

export async function getSubjectCover(subjectId, res) {
    const link = generateSubjectCoverLink(subjectId);
    await getBangumiImages(link, res)
}

export async function getSubjectCharacterImage(subjectId, characterId, res) {
    const link = generateCharacterImageLink(subjectId, characterId);
    await getBangumiImages(link, res)
}