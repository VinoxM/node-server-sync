import { allowLanHosts } from "#constants/allowHostsConst.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { checkBodyKeyMatch, checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from "#utils/preCheckUtil.js";
import { defineRoutes } from "#common/utils/defineUtil.js";
import { getRssCardFailedViews, getSubscribeBySubjectId, updateSubscribe } from "#modules/anime/service/rssService.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";
import { getEpisodeMatches } from "#modules/anime/service/rss/rssResultService.js";
import { analysisRssSubscribe, createSubscribeBySubjectId } from "#modules/anime/service/rss/rssSubscribeService.js";

const { GET, POST } = apiMethodConst;
const needSecret = () => "mAou5820.anime.rss";

export default defineRoutes({
    basePath: "/anime/rss",
    '/getRssMatchers': {
        method: GET,
        allowHosts: allowLanHosts,
        needSecret,
        callback: () => __env.get("rss.matchers", [])
    },
    '/getEpisodeMatchers': {
        method: GET,
        allowHosts: allowLanHosts,
        needSecret,
        callback: () => getEpisodeMatches()
    },
    '/getCardFailedViews': {
        method: GET,
        needAuth: needAuthSingleClient.MANAGE,
        allowHosts: allowLanHosts,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        needSecret,
        callback: () => getRssCardFailedViews()
    },
    '/getSubjectSubscribe': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        allowHosts: allowLanHosts,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, 'subjectId'),
        callback: req => getSubscribeBySubjectId(req.body.subjectId)
    },
    '/initSubjectSubscribe': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'subjectId'),
        callback: req => {
            const { subjectId } = req.body;
            return createSubscribeBySubjectId(subjectId);
        }
    },
    '/updateSubscribe': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['subsId', 'startTime'])
            && checkBodyKeyMatch(req, 'goon', [/[01]/])
            && checkBodyKeysExists(req, ['url', 'regex']),
        callback: req => updateSubscribe(req.body)
    },
    "/subscribeTest": {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (req) => checkBodyKeyNotBlank(req, 'url'),
        callback: async (req) => {
            const results = await analysisRssSubscribe({ regex: req.body.regex, url: req.body.url });
            return results.map(item => ({ title: item.title, pubDate: item.pubDate, torrent: item.torrent }));
        }
    }
});