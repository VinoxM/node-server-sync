import rssFavoritesRep from "../repository/rssFavoritesRep.js";

export async function filterUserRssFavorites(rssSubsIds) {
    return rssFavoritesRep.selectUserFavoritesBySubsIds(rssSubsIds).then(({ data }) => data)
}

export async function filterUserRssFavoritesWithUid(uid, subsIds) {
    return rssFavoritesRep.selectUserFavorites(uid, subsIds).then(({ data }) => data)
}

export async function addUserFavorite(uid, subsId) {
    return rssFavoritesRep.insertUserFavorite(uid, subsId).then(res => res.rows)
}

export async function removeUserFavorite(uid, subsId) {
    return rssFavoritesRep.deleteUserFavorite(uid, subsId).then(res => res.rows)
}