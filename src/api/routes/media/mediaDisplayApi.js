import apiMethodConst from "../../../common/constants/apiMethodConst.js"
import categoriesRep from "../../../modules/media/repository/categoriesRep.js"
import authorsRep from "../../../modules/media/repository/authorsRep.js"
import videoTagMapRep from "../../../modules/media/repository/videoTagMapRep.js"
import {
    checkBodyKeyMatch,
    checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray,
    checkBodyKeysNotBlank, checkHeaderInside, checkHeaderKeyMatchIfPresent,
    checkHeaderKeyNotBlank, checkHeaderKeyValue,
    checkQueryKeyNotBlank
} from "../../../common/utils/preCheckUtil.js"
import { checkVideoFilterRules } from "../../../modules/media/service/mediaFilterService.js"
import { checkCategoryExistsByInside, searchVideos } from "../../../modules/media/service/mediaVideoService.js"
import { getMinioClientMatchers } from "../../../modules/media/service/mediaMinioService.js"
import videoMinioRep from "../../../modules/media/repository/videoMinioRep.js"
import videosRep from "../../../modules/media/repository/videosRep.js"
import { allowLanHosts } from "../../../common/constants/allowHostsConst.js"
import { decodeAuthorization } from "../../../modules/authorization/authorizationService.js"
import { addUserFavorites, checkFavorites, getUserFavorites, removeUserFavorites } from "../../../modules/media/service/mediaFavoritesService.js"
import { FAVORITES_TARGET_TYPE } from "../../../modules/media/constants/favoritesConst.js"
import { getPlaylistByVideoId } from "../../../modules/media/service/mediaPlaylistService.js"

const { GET, POST } = apiMethodConst

const needSecret = () => "mAou5820.media.display"
const insideDisplaySecret = "mAou5820.media.display-inside"

function checkInsideHeader(req) {
    return checkHeaderInside(req, needSecret(), insideDisplaySecret)
}

function isInsideRequest(req) {
    return parseInt(req.headers['inside']) === 1
}

export default {
    basePath: "/media/display",
    "/getNewestCount": {
        method: GET,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        callback: req => videosRep.countForCardView(isInsideRequest(req))
    },
    "/searchVideos": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        preCheck: req => checkInsideHeader(req),
        callback: async req => {
            const userInfo = await decodeAuthorization(req)
            return searchVideos(req.body, isInsideRequest(req), userInfo?.id)
        }
    },
    "/getCategories": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        preCheck: req => checkInsideHeader(req),
        callback: req => categoriesRep.selectByInside(isInsideRequest(req)).then(({ data }) => data)
    },
    "/getAuthors": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'categoryId') && checkInsideHeader(req),
        callback: async req => {
            const categoryId = req.body['categoryId']
            const inside = parseInt(req.headers['inside'])
            await checkCategoryExistsByInside(categoryId, inside);
            const userInfo = await decodeAuthorization(req);
            if (userInfo) {
                return authorsRep.selectAuthorsByLatestUploadWithFavorites(categoryId, req.body['authorName'], userInfo.id).then(({ data }) => data)
            }
            return authorsRep.selectAuthorsByLatestUpload(categoryId, req.body['authorName']).then(({ data }) => data)
        }
    },
    "/getTags": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'categoryId') && checkInsideHeader(req),
        callback: async req => {
            const { videoId, categoryId } = req.body
            const inside = parseInt(req.headers['inside'])
            await checkCategoryExistsByInside(categoryId, inside);
            return videoTagMapRep.selectTagsWithCount(categoryId, videoId).then(({ data }) => data)
        }
    },
    "/getVideoDetail": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: req => videosRep.selectForPlay(req.body.videoId)
    },
    "/getSources": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: async req => videoMinioRep.selectSourceByVideoId(req.body['videoId']).then(({ data }) => data)
    },
    "/getBarrage": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: async req => videoMinioRep.selectBarrageByVideoId(req.body['videoId']).then(({ data }) => data)
    },
    "/videos/checkPolicy": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['category']) && checkBodyKeyNotEmptyArray(req, 'rules'),
        callback: req => checkVideoFilterRules(req.body)
    },
    "/getClientMatchers": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        callback: req => getMinioClientMatchers(req.body)
    },
    /** Favorites */
    "/getFavoritesVideo": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        needAuth: true,
        preCheck: req => checkInsideHeader(req),
        callback: async req => {
            const userInfo = await decodeAuthorization(req)
            userInfo || __throwMessage('Permission denied.', -401, 401)
            return getUserFavorites(userInfo.id, FAVORITES_TARGET_TYPE.VIDEO, isInsideRequest(req))
        }
    },
    "/getFavoritesAuthor": {
        method: POST,
        ignoreSecret: true,
        allowHosts: allowLanHosts,
        needAuth: true,
        preCheck: req => checkInsideHeader(req),
        callback: async req => {
            const userInfo = await decodeAuthorization(req)
            userInfo || __throwMessage('Permission denied.', -401, 401)
            return getUserFavorites(userInfo.id, FAVORITES_TARGET_TYPE.AUTHOR, isInsideRequest(req))
        }
    },
    "/addFavorites": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        needAuth: true,
        preCheck: req => checkBodyKeyMatch(req, 'targetType', [Object.values(FAVORITES_TARGET_TYPE).join("|")]) && checkBodyKeyNotBlank(req, 'targetId'),
        callback: async req => {
            const userInfo = await decodeAuthorization(req)
            userInfo || __throwMessage('Permission denied.', -401, 401)
            return addUserFavorites(userInfo.id, req.body.targetType, req.body.targetId)
        }
    },
    "/removeFavorites": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        needAuth: true,
        preCheck: req => checkBodyKeyMatch(req, 'targetType', [Object.values(FAVORITES_TARGET_TYPE).join("|")]) && checkBodyKeyNotBlank(req, 'targetId'),
        callback: async req => {
            const userInfo = await decodeAuthorization(req)
            userInfo || __throwMessage('Permission denied.', -401, 401)
            return removeUserFavorites(userInfo.id, req.body.targetType, req.body.targetId)
        }
    },
    "/checkFavorites": {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        needAuth: true,
        preCheck: req => checkBodyKeyNotEmptyArray(req, 'payload'),
        callback: async req => {
            const userInfo = await decodeAuthorization(req)
            userInfo || __throwMessage('Permission denied.', -401, 401)
            return checkFavorites(userInfo.id, req.body.payload)
        }
    },
    /** Playlists */
    "/getVideoPlaylists": {
        method: GET,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkQueryKeyNotBlank(req, 'videoId'),
        callback: req => getPlaylistByVideoId(req.query.videoId)
    }
}