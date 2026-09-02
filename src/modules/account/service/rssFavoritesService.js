import rssFavoritesRep from "#modules/account/repository/rssFavoritesRep.js";

/**
 * 根据 RSS 订阅 ID 列表批量过滤出已被收藏的记录
 * @param {Array<number|string>} rssSubsIds - 待查询的 RSS 订阅 ID 列表
 * @returns {Promise<Array<{ rssSubscribeId: number }>>} 已被收藏的订阅 ID 列表
 */
export async function filterUserRssFavorites(rssSubsIds) {
    return rssFavoritesRep.selectUserFavoritesBySubsIds(rssSubsIds).then(({ data }) => data)
}

/**
 * 查询指定用户收藏的 RSS 订阅列表（支持按订阅 ID 范围过滤）
 * @param {number|string} uid - 用户 ID
 * @param {Array<number|string>} [subsIds] - 可选的 RSS 订阅 ID 列表
 * @returns {Promise<Array<{ rssSubscribeId: number }>>} 收藏列表
 */
export async function filterUserRssFavoritesWithUid(uid, subsIds) {
    return rssFavoritesRep.selectUserFavorites(uid, subsIds).then(({ data }) => data)
}

/**
 * 为指定用户添加一条 RSS 订阅收藏
 * @param {number|string} uid - 用户 ID
 * @param {number|string} subsId - RSS 订阅 ID
 * @returns {Promise<number>} 插入影响的行数
 */
export async function addUserFavorite(uid, subsId) {
    return rssFavoritesRep.insertUserFavorite(uid, subsId).then(res => res.rows)
}

/**
 * 移除指定用户的某条 RSS 订阅收藏
 * @param {number|string} uid - 用户 ID
 * @param {number|string} subsId - RSS 订阅 ID
 * @returns {Promise<number>} 删除影响的行数
 */
export async function removeUserFavorite(uid, subsId) {
    return rssFavoritesRep.deleteUserFavorite(uid, subsId).then(res => res.rows)
}