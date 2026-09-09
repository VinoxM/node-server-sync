import { allowLanHosts } from "#constants/allowHostsConst.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { checkBodyKeysNotBlank } from "#utils/preCheckUtil.js";
import { defineRoutes } from "#common/utils/defineUtil.js";
import { getEpisodeExistsSubscriptions, getRssCardFailedViews, getRssEpisodeSource } from "#modules/anime/service/rssService.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";
import { getEpisodeMatches } from "#modules/anime/service/rss/rssResultService.js";

const { GET, POST } = apiMethodConst;
const needSecret = () => "mAou5820.anime.rss";

export default defineRoutes({
    basePath: "/anime/rss",
    '/getMatchers': {
        method: GET,
        needAuth: needAuthSingleClient.MANAGE,
        allowHosts: allowLanHosts,
        needSecret,
        callback: () => __env.get("rss.matchers", [])
    },
    '/getEpisodeMatchers': {
        method: GET,
        needAuth: needAuthSingleClient.MANAGE,
        allowHosts: allowLanHosts,
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
    '/getEpisodeExistsSubscriptions': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        allowHosts: allowLanHosts,
        needSecret,
        callback: req => getEpisodeExistsSubscriptions(req.body)
    },
    "/getEpisodeSource": {
        method: POST,
        needAuth: needAuthSingleClient.ANIME,
        allowHosts: allowLanHosts,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['rssSubsId', 'episode']),
        callback: req => getRssEpisodeSource(req.body.rssSubsId, req.body.episode)
    }
});