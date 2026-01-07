import apiMethodConst from '../../constraints/apiMethodConst.js';
import apiQueryConst from '../../constraints/apiQueryConst.js';
import rssRep from '../../repository/rss/rssRep.js';
import rssLinkRep from '../../repository/rss/rssLinkRep.js';
import rssCopyrightRep from '../../repository/rss/rssCopyrightRep.js';
import { checkQueryKeyNotBlank, checkQueryKeyMatchIfPresent as checkQueryKeyMatch } from '../../common/apiPreCheck.js';

const { GET } = apiMethodConst
const { SEASON, ID, NAME } = apiQueryConst

export default {
    basePath: "/rss",
    "/getSeason": {
        method: GET,
        ignoreOutput: true,
        callback: () => {
            return rssRep.selectRssSubscribeSeasons().then(({ data }) => data.map(d => d.season));
        }
    },
    "/getSearch": {
        method: GET,
        ignoreOutput: true,
        preCheck: (req) => {
            try {
                checkQueryKeyNotBlank(req, NAME);
            } catch (error) {
                checkQueryKeyNotBlank(req, SEASON);
            }
            checkQueryKeyMatch(req, SEASON, ['[0-9]{4}-(01|04|07|10)']);
        },
        callback: (req) => {
            return rssRep.selectRssSubscribeBySeasonAndSearch(req.query.season, req.query.name).then(({ data }) => data);
        }
    },
    "/getSearch.goon": {
        method: GET,
        ignoreOutput: true,
        preCheck: (req) => checkQueryKeyNotBlank(req, SEASON),
        callback: (req) => {
            return rssRep.selectRssSubscribeCauseGoon(req.query.season).then(({ data }) => data);
        }
    },
    "/getOne.results": {
        method: GET,
        ignoreOutput: true,
        preCheck: (req) => checkQueryKeyNotBlank(req, ID),
        callback: (req) => {
            const { id, withOutHide } = req.query;
            return rssRep.selectRssResultsByPid(id, withOutHide === '1').then(({ data }) => data);
        }
    },
    "/getOne.detail": {
        method: GET,
        ignoreOutput: true,
        preCheck: (req) => checkQueryKeyNotBlank(req, ID),
        callback: async (req) => {
            const { id } = req.query;
            const returnObj = {};
            const result = await rssRep.selectRssResultsByPid(id, true);
            returnObj.result = result.data;
            const link = await rssLinkRep.selectByPid(id);
            returnObj.link = link.data;
            const copyright = await rssCopyrightRep.selectByPid(id);
            returnObj.copyright = copyright.data;
            return returnObj;
        }
    },
    "/getMatchers": {
        method: GET,
        ignoreOutput: true,
        callback: () => __env.get("rss.matchers", [])
    }
}