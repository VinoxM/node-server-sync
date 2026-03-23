
import rssEpisodeRep from '../../repository/rss/rssEpisodeRep.js';
import apiMethodConst from '../../constraints/apiMethodConst.js';
import { EPISODE_STATUS } from '../../constraints/rssTaskStatusConst.js';
import { deleteOneEpisode, deleteOneFailedEpisode, generateMinioSharedLink, retryFailedEpisode, updateFailedEpisode } from '../../handler/rss/rssEpisodeHandler.js';
import { checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from '../../common/apiPreCheck.js';

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.rssEpisode";

export default {
    basePath: "/rss/episode",
    '/updateEpisodeStatus': {
        method: POST,
        allowHosts: ['server.vinoxm.name', '28000--main--code-server--maou864--coder.vinoxm.cloud'],
        needSecret,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'status']),
        callback: req => {
            const status = req.body.status
            const id = req.body.id
            if (!Object.values(EPISODE_STATUS).includes(status)) {
                throwMessage('Invalid episode status.')
            }
            __log.info(`[RssTask] Update rss episode[${id}] status: ${status}`)
            return rssEpisodeRep.updateStatusById(id, status)
        }
    },
    '/generateSharedLink': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'episodeId'),
        callback: req => generateMinioSharedLink(req.body.episodeId)
    },
    '/getEpisodes': {
        method: POST,
        needAuth: true,
        needSecret,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => rssEpisodeRep.selectBySubsId(req.body.rssSubsId).then(({ data }) => data)
    },
    "/deleteEpisode": {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'episodeId'),
        callback: req => deleteOneEpisode(req.body.episodeId)
    },
    '/getFailedEpisodes': {
        method: POST,
        needAuth: true,
        needSecret,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => rssEpisodeRep.selectFailedBySubsId(req.body.rssSubsId).then(({ data }) => data)
    },
    '/retryFailedEpisode': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'failedEpisodeId'),
        callback: req => retryFailedEpisode(req.body.failedEpisodeId)
    },
    '/updateFailedEpisode': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => {
            checkBodyKeysNotBlank(req, ['id', 'rootPath', 'fileName'])
            checkBodyKeysExists(req, ['episode', 'link'])
        },
        callback: req => updateFailedEpisode(req.body)
    },
    '/deleteFailedEpisode': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'failedEpisodeId'),
        callback: req => deleteOneFailedEpisode(req.body.failedEpisodeId)
    }
}