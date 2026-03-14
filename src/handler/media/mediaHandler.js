import videoMinioRep from "../../repository/media/videoMinioRep.js"
import videosRep from "../../repository/media/videosRep.js"

export async function searchVideos(body) {
    const { title, categoryId, authorId, currentPage = 1, pageSize = 20 } = body
    const dataList = await videosRep.selectForSearch(title, categoryId, authorId, currentPage, pageSize).then(({ data }) => data)
    const total = await videosRep.countForSearch(title, categoryId, authorId)
    return {
        list: dataList,
        totalSize: total,
        currentPage,
        pageSize
    }
}

export async function searchMinio(videoId) {
    return videoMinioRep.selectByVideoIdForDisplay(videoId).then(({ data }) => data)
}