import apiMethodConst from '../../../common/constants/apiMethodConst.js';
import { checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from '../../../common/utils/preCheckUtil.js';
import rssSubtitleRep from '../../../modules/rss/repository/rssSubtitleRep.js';
import { deleteEpisodeSubtitle, deleteEpisodeSubtitleFile, getRssSubtitleMatchers, recalculateEpisodeSubtitleFonts, retryUploadEpisodeSubtitle, updateEpisodeSubtitle } from '../../../modules/rss/service/rssSubtitleService.js';

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.rssSubtitle";

export default {
    basePath: "/rss/subtitle",
    '/getSubtitles': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => rssSubtitleRep.selectBySubsId(req.body.rssSubsId).then(({ data }) => data)
    },
    '/updateSubtitle': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']) && checkBodyKeysExists(req, ['episode', 'title', 'fonts', 'rootPath', 'fileName', 'minioLink']),
        callback: req => updateEpisodeSubtitle(req.body)
    },
    '/retryUploadEpisodeSubtitle': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => retryUploadEpisodeSubtitle(req.body.id)
    },
    '/recalculateAssSubtitleFonts': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => recalculateEpisodeSubtitleFonts(req.body.id)
    },
    '/deleteSubtitle': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => deleteEpisodeSubtitle(req.body.id)
    },
    '/deleteSubtitleFile': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => deleteEpisodeSubtitleFile(req.body.id)
    },
    '/getSubtitleMatchers': {
        method: POST,
        needSecret,
        callback: () => getRssSubtitleMatchers()
    }
}