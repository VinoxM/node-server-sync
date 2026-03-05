import { generateUUID } from "../../common/stringUtil.js";
import authorsRep from "../../repository/media/authorsRep.js";
import categoriesRep from "../../repository/media/categoriesRep.js";
import tagsRep from "../../repository/media/tagsRep.js";
import videosRep from "../../repository/media/videosRep.js";
import videoTagMapRep from "../../repository/media/videoTagMapRep.js";

export async function addVideo(videoObj) {
    const { title, author, category, tags, uploadTime } = videoObj
    let uniqueId = videoObj.uniqueId || generateUUID()
    const authorId = await addAuthor(author)
    const categoryId = await addCategory(category)
    const tagIds = []
    for (const tag of tags) {
        const tagId = await addTag(tag)
        tagIds.push(tagId)
    }
    let videoId = -1
    let toSave = true
    toSave &&= await checkWhiteList(authorId, categoryId, uniqueId)
    toSave &&= await checkBlackList(authorId, categoryId, uniqueId)
    if (toSave) {
        const { lastId } = await videosRep.insertOne({ uniqueId, title, authorId, categoryId, uploadTime })
        videoId = lastId;
        await videoTagMapRep.insertTags(videoId, tagIds)
    }
    return { videoId };
}

async function checkWhiteList(authorId, categoryId, uniqueId) {
    // todo
    return true;
}

async function checkBlackList(authorId, categoryId, uniqueId) {
    // todo
    return true;
}

export async function delVideo(videoId) {
    const { rows } = await videosRep.deleteOne(videoId)
    if (rows > 0) {
        await videoTagMapRep.deleteTags(videoId)

        // todo detele minio resources        
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