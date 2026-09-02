import categoriesRep from "../repository/categoriesRep.js";
import playlistsRep from "../repository/playlistsRep.js";
import videosRep from "../repository/videosRep.js";

/**
 * 分页搜索播单列表
 * @param {Object} body - 搜索条件
 * @param {number} [body.categoryId] - 分类 ID
 * @param {string} [body.title] - 播单标题模糊搜索
 * @param {number} [body.pageNum=1] - 当前页码
 * @param {number} [body.pageSize=20] - 每页条数
 * @param {boolean} [isInside=false] - 是否内部私密分类
 * @returns {Promise<{ record: any[], total: number, pageNum: number, pageSize: number }>}
 */
export async function searchPlaylist(body, isInside = false) {
    const { categoryId, title, pageNum = 1, pageSize = 20 } = body;
    const record = await playlistsRep.selectForSearch(categoryId, title, pageNum, pageSize, isInside).then(res => res.data || []);
    const total = await playlistsRep.selectCountForSearch(categoryId, title, isInside);
    return { record, total, pageNum, pageSize };
}

/**
 * 根据视频 ID 查询所属的播单列表
 * @param {number} videoId - 视频 ID
 * @returns {Promise<Array<{ playlistId: number, categoryId: number, title: string }>>}
 */
export async function getPlaylistsByVideoId(videoId) {
    return playlistsRep.selectByVideoId(videoId).then(res => res.data || []);
}

/**
 * 创建一个新播单
 * @param {number} categoryId - 分类 ID
 * @param {string} title - 播单标题
 * @returns {Promise<number|undefined>} 新增播单主键 ID
 */
export async function createPlaylist(categoryId, title) {
    const category = await categoriesRep.selectOneById(categoryId);
    category || __throwMessage('Category not exists');
    return playlistsRep.insertOne(categoryId, title).then(res => res?.lastId);
}

/**
 * 修改播单标题
 * @param {number} id - 播单 ID
 * @param {string} title - 新标题
 * @returns {Promise<ExecResult>}
 */
export async function updatePlaylistTitle(id, title) {
    return playlistsRep.updateTitle(id, title);
}

/**
 * 根据播单 ID 获取播单详情及全量关联视频明细
 * @param {number} id - 播单 ID
 * @returns {Promise<any[]>}
 */
export async function getPlaylistById(id) {
    return playlistsRep.selectPlaylistById(id).then(({ data }) => data);
}

/**
 * 根据视频 ID 获取包含该视频的所有播单及各自的可播放视频列表 (COMPLETE 状态)
 * @param {number} videoId - 视频 ID
 * @returns {Promise<Array<{ id: number, title: string, videos: any[] }>>}
 */
export async function getPlaylistByVideoId(videoId) {
    const playlists = await getPlaylistsByVideoId(videoId);
    const result = [];
    for (const { playlistId, title } of playlists) {
        const obj = { id: playlistId, title, videos: [] };
        obj.videos = await playlistsRep.selectPlaylistPlayableVideosById(playlistId).then(res => res.data || []);
        obj.videos.length > 0 && result.push(obj);
    }
    return result;
}

/**
 * 按播单标题将视频加入指定播单（若播单不存在则自动以该视频同分类创建）
 * @param {number} videoId - 视频 ID
 * @param {string} title - 播单标题
 * @returns {Promise<ExecResult>}
 */
export async function addPlaylistVideoByTitle(videoId, title) {
    const video = await videosRep.selectOne(videoId);
    video || __throwMessage('Video not exists');
    const categoryId = video.categoryId;
    await playlistsRep.insertOneNotIgnoreByTitle(categoryId, title);
    const playList = await playlistsRep.selectOneByTitleAndCategory(title, categoryId);
    playList || __throwMessage('Playlist not exists');
    playList.categoryId === categoryId || __throwMessage("Video's category not equals playlist");
    const id = playList.id;
    const maxSort = await playlistsRep.selectMaxSortedByPlaylistId(id);
    const toSort = maxSort + 1;
    return playlistsRep.insertVideo(id, videoId, toSort);
}

/**
 * 将视频加入指定播单并指定排序权重
 * @param {number} id - 播单 ID
 * @param {number} videoId - 视频 ID
 * @param {number} [sort] - 排序权重偏移
 * @returns {Promise<ExecResult>}
 */
export async function addPlaylistVideo(id, videoId, sort) {
    const playList = await playlistsRep.selectOneById(id);
    playList || __throwMessage('Playlist not exists');
    const video = await videosRep.selectOne(videoId);
    video || __throwMessage('Video not exists');
    playList.categoryId === video.categoryId || __throwMessage("Video's category not equals playlist");
    const maxSort = await playlistsRep.selectMaxSortedByPlaylistId(id);
    const toSort = (sort ?? 1) + maxSort;
    return playlistsRep.insertVideo(id, videoId, toSort);
}

/**
 * 批量向播单添加视频
 * @param {Array<{ id: number, videoId: number, sort?: number }>} arr - 添加项列表
 * @returns {Promise<void>}
 */
export async function addPlaylistVideoBatch(arr) {
    for (const item of arr) {
        try {
            await addPlaylistVideo(item.id, item.videoId, item.sort);
        } catch (error) {
            __log.error(`[Playlist] Add playlist video failed. Cause: `, error.message ?? error);
        }
    }
}

/**
 * 更新播单中某个视频的排序权重
 * @param {number} id - 播单 ID
 * @param {number} videoId - 视频 ID
 * @param {number} sort - 新排序值
 * @returns {Promise<ExecResult>}
 */
export async function updatePlaylistVideoSort(id, videoId, sort) {
    return playlistsRep.updateVideoSort(id, videoId, sort);
}

/**
 * 批量更新播单关联视频的排序序号
 * @param {Array<{ id: number, sort: number }>} arr - 关联表主键与排序值数组
 * @returns {Promise<void>}
 */
export async function updatePlaylistVideoSortBatch(arr) {
    return playlistsRep.updateSortsByIds(arr);
}

/**
 * 根据视频 ID 清除所有播单对该视频的引用
 * @param {number} videoId - 视频 ID
 * @returns {Promise<ExecResult>}
 */
export async function removePlaylistByVideoId(videoId) {
    return playlistsRep.deleteByVideoId(videoId);
}

/**
 * 从指定播单中移除单个视频
 * @param {number} id - 播单 ID
 * @param {number} videoId - 视频 ID
 * @returns {Promise<ExecResult>}
 */
export async function removePlaylistVideo(id, videoId) {
    return playlistsRep.deleteVideo(id, videoId);
}

/**
 * 从指定播单中批量移除多个视频
 * @param {number} id - 播单 ID
 * @param {number[]} videos - 视频 ID 数组
 * @returns {Promise<ExecResult>}
 */
export async function removePlaylistVideos(id, videos) {
    return playlistsRep.deleteVideos(id, videos);
}

/**
 * 删除播单并清空其所有关联视频明细
 * @param {number} id - 播单 ID
 * @returns {Promise<void>}
 */
export async function removePlaylist(id) {
    await playlistsRep.deleteOne(id);
    await playlistsRep.deleteByPlaylistId(id);
}