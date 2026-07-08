import { MEDIA_CATEGORY_TYPE } from "../constants/mediaConst.js";
import categoriesRep from "../repository/categoriesRep.js";
import playlistsRep from "../repository/playlistsRep.js";
import videosRep from "../repository/videosRep.js";

export async function searchPlaylist(body, isInside = false) {
    const { categoryId, title, pageNum = 1, pageSize = 20 } = body
    const record = await playlistsRep.selectForSearch(categoryId, title, pageNum, pageSize, isInside).then(res => res.data || [])
    const total = await playlistsRep.selectCountForSearch(categoryId, title, isInside);
    return { record, total, pageNum, pageSize }
}

export async function getPlaylistsByVideoId(videoId) {
    return playlistsRep.selectByVideoId(videoId).then(res => res.data || [])
}

export async function createPlaylist(categoryId, title) {
    const category = await categoriesRep.selectOneById(categoryId);
    category || __throwMessage('Category not exists');
    return playlistsRep.insertOne(categoryId, title).then(res => res?.lastId);
}

export async function updatePlaylistTitle(id, title) {
    return playlistsRep.updateTitle(id, title);
}

export async function getPlaylistById(id) {
    return playlistsRep.selectPlaylistById(id).then(({ data }) => data);
}

export async function getPlaylistByVideoId(videoId) {
    const playlists = await getPlaylistsByVideoId(videoId);
    const result = []
    for (const { playlistId, title } of playlists) {
        const obj = { id: playlistId, title, videos: [] }
        obj.videos = await playlistsRep.selectPlaylistPlayableVideosById(playlistId).then(res => res.data || [])
        obj.videos.length > 0 && result.push(obj)
    }
    return result
}

export async function addPlaylistVideoByTitle(videoId, title) {
    const video = await videosRep.selectOne(videoId);
    video || __throwMessage('Video not exists');
    const categoryId = video.categoryId
    await playlistsRep.insertOneNotIgnoreByTitle(categoryId, title);
    const playList = await playlistsRep.selectOneByTitleAndCategory(title, categoryId);
    playList || __throwMessage('Playlist not exists');
    playList.categoryId === categoryId || __throwMessage("Video's category not equals playlist");
    const id = playList.id
    const maxSort = await playlistsRep.selectMaxSortedByPlaylistId(id);
    const toSort = maxSort + 1
    return playlistsRep.insertVideo(id, videoId, toSort);
}

export async function addPlaylistVideo(id, videoId, sort) {
    const playList = await playlistsRep.selectOneById(id);
    playList || __throwMessage('Playlist not exists');
    const video = await videosRep.selectOne(videoId);
    video || __throwMessage('Video not exists');
    playList.categoryId === video.categoryId || __throwMessage("Video's category not equals playlist");
    const maxSort = await playlistsRep.selectMaxSortedByPlaylistId(id);
    const toSort = (sort ?? 1) + maxSort
    return playlistsRep.insertVideo(id, videoId, toSort);
}

export async function addPlaylistVideoBatch(arr) {
    for (const item of arr) {
        try {
            await addPlaylistVideo(item.id, item.videoId, item.sort)
        } catch (error) {
            __log.error(`[Playlist] Add playlist video failed. Cause: `, error.message ?? error)
        }
    }
}

export async function updatePlaylistVideoSort(id, videoId, sort) {
    return playlistsRep.updateVideoSort(id, videoId, sort);
}

export async function updatePlaylistVideoSortBatch(arr) {
    return playlistsRep.updateSortsByIds(arr);
}

export async function removePlaylistByVideoId(videoId) {
    return playlistsRep.deleteByVideoId(videoId);
}

export async function removePlaylistVideo(id, videoId) {
    return playlistsRep.deleteVideo(id, videoId);
}

export async function removePlaylist(id) {
    await playlistsRep.deleteOne(id);
    await playlistsRep.deleteByPlaylistId(id);
}