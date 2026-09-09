import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import rssEpisodeRep from '#modules/anime/repository/rss/rssEpisodeRep.js';
import {
    deleteOneEpisode, deleteOneFailedEpisode,
    retryFailedEpisode, updateEpisodeStatus, updateFailedEpisode
} from '#modules/anime/service/rss/rssEpisodeService.js';
import { allowLanHosts } from '#constants/allowHostsConst.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';

const { POST } = apiMethodConst;

const needAuth = needAuthSingleClient.MANAGE;
const needSecret = () => "mAou5820.anime.rssEpisode";

export default {
    basePath: "/anime/rss/episode",
    '/updateEpisodeStatus': {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'status']),
        callback: req => updateEpisodeStatus(req.body.id, req.body.status)
    },
    '/getEpisodes': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => rssEpisodeRep.selectBySubsId(req.body.rssSubsId).then(({ data }) => data)
    },
    "/deleteEpisode": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'episodeId'),
        callback: req => deleteOneEpisode(req.body.episodeId)
    },
    '/getFailedEpisodes': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => rssEpisodeRep.selectFailedBySubsId(req.body.rssSubsId).then(({ data }) => data)
    },
    '/retryFailedEpisode': {
        method: POST,
        needAuth,
        needSecret,
        maybeStream: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'failedEpisodeId'),
        callback: req => retryFailedEpisode(req.body.failedEpisodeId)
    },
    '/updateFailedEpisode': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'rootPath', 'fileName']) && checkBodyKeysExists(req, ['episode', 'link']),
        callback: req => updateFailedEpisode(req.body)
    },
    '/deleteFailedEpisode': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'failedEpisodeId'),
        callback: req => deleteOneFailedEpisode(req.body.failedEpisodeId)
    }
}