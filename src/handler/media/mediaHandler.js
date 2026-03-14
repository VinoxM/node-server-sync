import videoMinioRep from "../../repository/media/videoMinioRep.js"
import videosRep from "../../repository/media/videosRep.js"

export async function searchVideos(body) {
    const { title, categoryId, authorId } = body
    return videosRep.selectForSearch(title, categoryId, authorId).then(({ data }) => data)
}

export async function searchMinio(videoId) {
    return videoMinioRep.selectByVideoIdForDisplay(videoId).then(({ data }) => data)
}