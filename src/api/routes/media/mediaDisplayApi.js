import apiMethodConst from "../../../common/constants/apiMethodConst.js"
import { MEDIA_ALLOW_HOSTS as allowHosts } from "../../../modules/media/constants/mediaConst.js"
import categoriesRep from "../../../modules/media/repository/categoriesRep.js"
import authorsRep from "../../../modules/media/repository/authorsRep.js"
import videoTagMapRep from "../../../modules/media/repository/videoTagMapRep.js"
import {
    checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray,
    checkBodyKeysNotBlank, checkHeaderKeyMatchIfPresent, checkHeaderKeyNotBlank, checkHeaderKeyValue
} from "../../../common/utils/preCheckUtil.js"
import { checkVideoFilterRules } from "../../../modules/media/service/mediaFilterService.js"
import { checkCategoryExistsByInside, searchVideos } from "../../../modules/media/service/mediaVideoService.js"
import { getMinioClientMatchers } from "../../../modules/media/service/mediaMinioService.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.display"
const insideDisplaySecret = "mAou5820.media.display-inside"

function checkInsideHeader(req) {
    checkHeaderKeyNotBlank(req, 'inside')
    checkHeaderKeyMatchIfPresent(req, 'inside', ['[0|1]'])
    if (parseInt(req.headers['inside']) === 0) {
        checkHeaderKeyValue(req, 'secret', needSecret())
    } else {
        checkHeaderKeyValue(req, 'secret', insideDisplaySecret)
    }
}

function isInsideRequest(req) {
    return parseInt(req.headers['inside']) === 1
}

export default {
    basePath: "/media/display",
    "/searchVideos": {
        method: POST,
        ignoreSecret: true,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkInsideHeader(req),
        callback: req => searchVideos(req.body, isInsideRequest(req))
    },
    "/getCategories": {
        method: POST,
        ignoreSecret: true,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkInsideHeader(req),
        callback: req => categoriesRep.selectByInside(isInsideRequest(req)).then(({ data }) => data)
    },
    "/getAuthors": {
        method: POST,
        ignoreSecret: true,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'categoryId') && checkInsideHeader(req),
        callback: async req => {
            const categoryId = req.body['categoryId']
            const inside = parseInt(req.headers['inside'])
            await checkCategoryExistsByInside(categoryId, inside);
            return authorsRep.selectAuthorsByLatestUpload(categoryId, req.body['authorName']).then(({ data }) => data)
        }
    },
    "/getTags": {
        method: POST,
        ignoreSecret: true,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'categoryId') && checkInsideHeader(req),
        callback: async req => {
            const { videoId, categoryId } = req.body
            const inside = parseInt(req.headers['inside'])
            await checkCategoryExistsByInside(categoryId, inside);
            return videoTagMapRep.selectTagsWithCount(categoryId, videoId).then(({ data }) => data)
        }
    },
    "/videos/checkPolicy": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['category']) && checkBodyKeyNotEmptyArray(req, 'rules'),
        callback: req => checkVideoFilterRules(req.body)
    },
    "/getClientMatchers": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        callback: req => getMinioClientMatchers(req.body)
    }
}