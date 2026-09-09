import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import rssSubtitleRep from '#modules/anime/repository/rss/rssSubtitleRep.js';
import {
    deleteEpisodeSubtitle, deleteEpisodeSubtitleFile, getRssSubtitleMatchers,
    recalculateEpisodeSubtitleFonts, retryUploadEpisodeSubtitle, updateEpisodeSubtitle
} from '#modules/anime/service/rss/rssSubtitleService.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import { allowLanHosts } from '#common/constants/allowHostsConst.js';

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.anime.rssSubtitle";

export default {
    basePath: "/anime/rss/subtitle",
    '/getSubtitles': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => rssSubtitleRep.selectBySubsId(req.body.rssSubsId).then(({ data }) => data)
    },
    '/updateSubtitle': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']) && checkBodyKeysExists(req, ['episode', 'title', 'fonts', 'rootPath', 'fileName', 'minioLink']),
        callback: req => updateEpisodeSubtitle(req.body)
    },
    '/retryUploadEpisodeSubtitle': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => retryUploadEpisodeSubtitle(req.body.id)
    },
    '/recalculateAssSubtitleFonts': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => recalculateEpisodeSubtitleFonts(req.body.id)
    },
    '/deleteSubtitle': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => deleteEpisodeSubtitle(req.body.id)
    },
    '/deleteSubtitleFile': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => deleteEpisodeSubtitleFile(req.body.id)
    },
    '/getSubtitleMatchers': {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        callback: () => getRssSubtitleMatchers()
    }
}