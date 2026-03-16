import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { MEDIA_ALLOW_CIDR as allowCIDR } from "../../constraints/mediaConst.js"
import { searchVideos } from "../../handler/media/mediaHandler.js"
import categoriesRep from "../../repository/media/categoriesRep.js"
import authorsRep from "../../repository/media/authorsRep.js"
import videoTagMapRep from "../../repository/media/videoTagMapRep.js"
import { checkVideoFilterRules } from "../../handler/media/mediaFilterHandler.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.display"

export default {
    basePath: "/media/display",
    "/searchVideos": {
        method: POST,
        needSecret,
        allowCIDR,
        ignoreOutput: true,
        callback: req => searchVideos(req.body)
    },
    "/getCategories": {
        method: POST,
        needSecret,
        allowCIDR,
        ignoreOutput: true,
        callback: () => categoriesRep.selectAll().then(({ data }) => data)
    },
    "/getAuthors": {
        method: POST,
        needSecret,
        allowCIDR,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'categoryId'),
        callback: req => authorsRep.selectAuthorsByLatestUpload(req.body['categoryId']).then(({ data }) => data)
    },
    "/getTags": {
        method: POST,
        needSecret,
        allowCIDR,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'categoryId'),
        callback: req => {
            const { videoId, categoryId } = req.body
            return videoTagMapRep.selectTagsWithCount(categoryId, videoId).then(({ data }) => data)
        }
    },
    "/videos/checkPolicy": {
        method: POST,
        needSecret,
        allowCIDR,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['category']) && checkBodyKeyNotEmptyArray(req, 'rules'),
        callback: req => checkVideoFilterRules(req.body)
    }
}