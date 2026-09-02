import { FAVORITES_TARGET_TYPE } from "../constants/favoritesConst.js";
import favoritesRep from "../repository/favoritesRep.js";

/**
 * 根据收藏类型获取当前用户的收藏列表（创作者或视频）
 * @param {number} userId - 用户 ID
 * @param {string} favoritesType - 收藏目标类型 ('1': AUTHOR, '2': VIDEO)
 * @param {boolean} [isInside=false] - 是否包含/仅限内部私密分类
 * @returns {Promise<any[]|null>} 收藏记录列表
 */
export async function getUserFavorites(userId, favoritesType, isInside) {
    if (FAVORITES_TARGET_TYPE.AUTHOR === favoritesType) {
        return favoritesRep.selectAuthorFavorites(userId, isInside).then(({ data }) => data);
    }
    if (FAVORITES_TARGET_TYPE.VIDEO === favoritesType) {
        return favoritesRep.selectVideoFavorites(userId, isInside).then(({ data }) => data);
    }
    return null;
}

/**
 * 添加一条用户媒体收藏（创作者或视频）
 * @param {number} userId - 用户 ID
 * @param {string} targetType - 目标类型 ('1' 或 '2')
 * @param {number} targetId - 目标主键 ID (创作者 ID 或 视频 ID)
 * @returns {Promise<ExecResult>}
 */
export async function addUserFavorites(userId, targetType, targetId) {
    return favoritesRep.insertOne(userId, targetType, targetId);
}

/**
 * 取消/删除一条用户媒体收藏
 * @param {number} userId - 用户 ID
 * @param {string} targetType - 目标类型 ('1' 或 '2')
 * @param {number} targetId - 目标主键 ID
 * @returns {Promise<ExecResult>}
 */
export async function removeUserFavorites(userId, targetType, targetId) {
    return favoritesRep.deleteOne(userId, targetType, targetId);
}

/**
 * 批量检查用户对多个目标的收藏状态
 * @param {number} userId - 用户 ID
 * @param {Array<{ targetId: number, targetType: string }>} payload - 待检查的目标列表
 * @returns {Promise<Array<{ targetType: string, targetId: number }>>} 已收藏的目标列表
 */
export async function checkFavorites(userId, payload) {
    const result = [];
    for (const { targetId, targetType } of payload) {
        const b = await favoritesRep.checkFavorites(userId, targetType, targetId);
        b && result.push({ targetType, targetId });
    }
    return result;
}