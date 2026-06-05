import { FAVORITES_TARGET_TYPE } from "../constants/favoritesConst.js";
import favoritesRep from "../repository/favoritesRep.js";

export async function getUserFavorites(userId, favoritesType, isInside) {
    if (FAVORITES_TARGET_TYPE.AUTHOR === favoritesType) {
        return favoritesRep.selectAuthorFavorites(userId, isInside).then(({ data }) => data)
    }
    if (FAVORITES_TARGET_TYPE.VIDEO === favoritesType) {
        return favoritesRep.selectVideoFavorites(userId, isInside).then(({ data }) => data)
    }
    return null
}

export async function addUserFavorites(userId, targetType, targetId) {
    return favoritesRep.insertOne(userId, targetType, targetId)
}

export async function removeUserFavorites(userId, targetType, targetId) {
    return favoritesRep.deleteOne(userId, targetType, targetId)
}

export async function checkFavorites(userId, payload) {
    const result = []
    for (const { targetId, targetType } of payload) {
        const b = await favoritesRep.checkFavorites(userId, targetType, targetId)
        b && result.push({ targetType, targetId })
    }
    return result
}