import apiMethodConst from "#constants/apiMethodConst.js";
import apiBodyConst from "#constants/apiBodyConst.js";
import { checkBodyKeyMatch, checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from "#utils/preCheckUtil.js";
import { addOneResult, deleteAllSubscribeResults, deleteOneResult, editOneResult, getResultsBySubsId, hideOneResult } from "#modules/anime/service/rss/rssResultService.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";

const { POST, GET } = apiMethodConst;
const { ID, PID, TORRENT, TITLE, PUB_DATE, HIDE } = apiBodyConst;
const needAuth = needAuthSingleClient.MANAGE;
const needSecret = () => 'mAou5820.anime.rssResult';

export default {
    basePath: "/anime/rss/result",
    "/getResults": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, 'subsId'),
        callback: async (req) => getResultsBySubsId(req.body.subsId)
    },
    "/delOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, ID),
        callback: async (req) => deleteOneResult(req.body[ID])
    },
    "/delMany": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, PID),
        callback: async (req) => deleteAllSubscribeResults(req.body[PID])
    },
    "/hideOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, ID) && checkBodyKeyMatch(req, HIDE, [/[01]/]),
        callback: async (req) => hideOneResult(req.body[ID], req.body[HIDE])
    },
    "/addOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, [PID, TITLE, TORRENT]) && checkBodyKeysExists(req, [PUB_DATE]),
        callback: async (req) => addOneResult(req.body)
    },
    "/editOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, [ID, TITLE, TORRENT]) && checkBodyKeysExists(req, [PUB_DATE]),
        callback: async (req) => editOneResult(req.body)
    }
}