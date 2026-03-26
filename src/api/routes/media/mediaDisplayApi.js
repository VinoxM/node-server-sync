import apiMethodConst from "../../../common/constants/apiMethodConst.js"
import { MEDIA_ALLOW_HOSTS as allowHosts } from "../../../modules/media/constants/mediaConst.js"
import categoriesRep from "../../../modules/media/repository/categoriesRep.js"
import authorsRep from "../../../modules/media/repository/authorsRep.js"
import videoTagMapRep from "../../../modules/media/repository/videoTagMapRep.js"
import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank } from "../../../common/utils/preCheckUtil.js"
import { checkVideoFilterRules } from "../../../modules/media/service/mediaFilterService.js"
import { searchVideos } from "../../../modules/media/service/mediaVideoService.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.display"

export default {
    basePath: "/media/display",
    "/searchVideos": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        callback: req => searchVideos(req.body)
    },
    "/getCategories": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        callback: () => categoriesRep.selectAll().then(({ data }) => data)
    },
    "/getAuthors": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'categoryId'),
        callback: req => authorsRep.selectAuthorsByLatestUpload(req.body['categoryId'], req.body['authorName']).then(({ data }) => data)
    },
    "/getTags": {
        method: POST,
        needSecret,
        allowHosts,
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
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['category']) && checkBodyKeyNotEmptyArray(req, 'rules'),
        callback: req => checkVideoFilterRules(req.body)
    }
}