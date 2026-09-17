import { NEED_AUTH_CLIENT } from "#common/constants/authorizationConst.js";
import {
    batchGetMediaProgress,
    clearMediaProgress,
    deleteMediaProgress,
    getMediaProgress,
    getRecentMediaProgressList,
    saveMediaProgress
} from "#modules/progress/progressStore.js";

/**
 * 保存指定用户在某番剧特定集数的播放进度
 * @param {Object} userInfo - 用户身份信息 (需包含 id)
 * @param {string|number} subjectId - 番剧 ID
 * @param {string|number} episode - 集数 (如 1, 2, "01")
 * @param {Omit<import('#types/progressTypes.d.ts').MediaProgressPayload, 'userId'|'videoId'|'platform'>} [payload={}] - 进度载荷 (如 currentTime, duration, extra 等)
 * @returns {Promise<boolean>} 是否成功保存
 */
export async function saveAnimeProgress(userInfo, subjectId, episode, payload = {}) {
    if (!userInfo?.id || __isAnyBlank(subjectId, episode)) return false;
    const userId = userInfo.id;
    const videoId = `${subjectId}:${episode}`;
    const platform = NEED_AUTH_CLIENT.ANIME;
    return saveMediaProgress({
        userId,
        videoId,
        platform,
        ...payload
    });
}

/**
 * 获取指定用户在某番剧特定集数的播放进度 (用于断点续播)
 * @param {Object} userInfo - 用户身份信息
 * @param {string|number} subjectId - 番剧 ID
 * @param {string|number} episode - 集数
 * @returns {Promise<import('#types/progressTypes.d.ts').MediaProgressPayload|null>} 播放进度对象，不存在时返回 null
 */
export async function getAnimeProgress(userInfo, subjectId, episode) {
    if (!userInfo?.id || __isAnyBlank(subjectId, episode)) return null;
    const userId = userInfo.id;
    const videoId = `${subjectId}:${episode}`;
    const platform = NEED_AUTH_CLIENT.ANIME;
    return getMediaProgress(platform, userId, videoId);
}

/**
 * 批量获取指定番剧各剧集的播放进度及最后播放时间 (方案二：批量拉取比对)
 * @param {Object} userInfo - 用户身份信息 (需包含 id)
 * @param {string|number} subjectId - 番剧 ID
 * @param {Array<string|number>} episodes - 剧集列表 (如 [1, 2, 3, ...] 或 ['01', '02'])
 * @returns {Promise<import('#types/progressTypes.d.ts').AnimeEpisodesProgressResult>} 包含最近播放的一集 (latest)、各集列表 (list) 与字典映射 (map)
 */
export async function getAnimeEpisodesProgress(userInfo, subjectId, episodes) {
    const emptyResult = { latest: null, list: [], map: {} };
    if (!userInfo?.id || __isBlank(subjectId) || !Array.isArray(episodes) || episodes.length === 0) {
        return emptyResult;
    }

    const userId = userInfo.id;
    const platform = NEED_AUTH_CLIENT.ANIME;
    const validEpisodes = episodes.filter(ep => !__isBlank(ep));
    if (validEpisodes.length === 0) return emptyResult;

    const videoIds = validEpisodes.map(ep => `${subjectId}:${ep}`);
    const progressMap = await batchGetMediaProgress(platform, userId, videoIds);

    const list = [];
    const map = {};
    let latest = null;
    let maxUpdatedAt = -1;

    for (const ep of validEpisodes) {
        const vid = `${subjectId}:${ep}`;
        const record = progressMap[vid];

        if (record && typeof record === 'object') {
            const item = {
                episode: ep,
                currentTime: record.currentTime ?? 0,
                duration: record.duration ?? 0,
                percentage: record.percentage ?? 0,
                isFinished: Boolean(record.isFinished),
                updatedAt: record.updatedAt ?? null,
                extra: record.extra
            };
            list.push(item);
            map[ep] = item;

            if (typeof item.updatedAt === 'number' && item.updatedAt > maxUpdatedAt) {
                maxUpdatedAt = item.updatedAt;
                latest = item;
            }
        } else {
            const emptyItem = {
                episode: ep,
                currentTime: 0,
                duration: 0,
                percentage: 0,
                isFinished: false,
                updatedAt: null
            };
            list.push(emptyItem);
            map[ep] = null;
        }
    }

    return {
        latest,
        list,
        map
    };
}

/**
 * 分页获取指定用户的番剧最近播放历史列表 (按播放时间倒序)
 * @param {Object} userInfo - 用户身份信息
 * @param {number} [pageNum=1] - 当前页码 (从 1 开始)
 * @param {number} [pageSize=20] - 每页条数
 * @returns {Promise<import('#types/progressTypes.d.ts').RecentProgressListResult>}
 */
export async function getAnimeProgressList(userInfo, pageNum = 1, pageSize = 20) {
    if (!userInfo?.id) return { total: 0, pageNum: 1, pageSize: 20, list: [] };
    const userId = userInfo.id;
    const platform = NEED_AUTH_CLIENT.ANIME;
    const result = await getRecentMediaProgressList(platform, userId, pageNum, pageSize);
    const list = (result?.list || []).map(item => {
        const [subjectId, episode] = String(item.videoId || '').split(':');
        return {
            ...item,
            subjectId: subjectId ? Number(subjectId) || subjectId : undefined,
            episode: episode ? Number(episode) || episode : undefined
        };
    });
    return {
        total: result?.total || 0,
        pageNum: result?.pageNum || pageNum,
        pageSize: result?.pageSize || pageSize,
        list
    };
}

/**
 * 清空指定用户的所有番剧播放进度与历史记录
 * @param {Object} userInfo - 用户身份信息
 * @returns {Promise<boolean>} 是否成功清空
 */
export async function clearAnimeProgress(userInfo) {
    if (!userInfo?.id) return false;
    const userId = userInfo.id;
    const platform = NEED_AUTH_CLIENT.ANIME;
    return clearMediaProgress(platform, userId);
}

/**
 * 删除指定用户在某番剧特定集数的播放进度
 * @param {Object} userInfo - 用户身份信息
 * @param {string|number} subjectId - 番剧 ID
 * @param {string|number|Array<string|number>} episode - 单集或多集集数
 * @returns {Promise<boolean>} 是否成功删除
 */
export async function deleteAnimeProgress(userInfo, subjectId, episode) {
    if (!userInfo?.id || __isBlank(subjectId) || !episode) return false;
    const userId = userInfo.id;
    const platform = NEED_AUTH_CLIENT.ANIME;
    const episodes = Array.isArray(episode) ? episode : [episode];
    const videoIds = episodes.map(ep => `${subjectId}:${ep}`);
    return deleteMediaProgress(platform, userId, videoIds);
}