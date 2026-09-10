import apiMethodConst from "#constants/apiMethodConst.js";
import apiBodyConst from "#constants/apiBodyConst.js";
import { checkBodyKeyNotBlank } from "#utils/preCheckUtil.js";
import { addRssRegex, getRssRegex } from "#modules/anime/service/rss/rssRegexHistoryService.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";
import { allowLanHosts } from "#common/constants/allowHostsConst.js";

const { REGEX } = apiBodyConst;
const { GET, POST } = apiMethodConst;

const needSecret = () => 'mAou5820.anime.rssRegex';
const needAuth = needAuthSingleClient.MANAGE;

export default {
    basePath: "/anime/rss/regex",
    "/history": {
        method: GET,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        callback: () => {
            return getRssRegex();
        }
    },
    "/add": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (req) => checkBodyKeyNotBlank(req, REGEX),
        callback: async (req) => {
            const regex = req.body[REGEX];
            return addRssRegex(regex).then(() => null);
        }
    }
}