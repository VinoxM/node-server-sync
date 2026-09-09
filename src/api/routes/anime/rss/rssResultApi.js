import apiMethodConst from "#constants/apiMethodConst.js";
import apiBodyConst from "#constants/apiBodyConst.js";
import { checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from "#utils/preCheckUtil.js";
import rssResultRep from "#modules/anime/repository/rss/rssResultRep.js";
import { addOneResult, editOneResult } from "#modules/anime/service/rss/rssResultService.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";

const { POST, GET } = apiMethodConst;
const { ID, PID, TORRENT, TITLE, PUB_DATE, HIDE } = apiBodyConst;
const needAuth = needAuthSingleClient.MANAGE;
const needSecret = () => 'mAou5820.anime.rssResult';

export default {
    basePath: "/anime/rss/result",
    "/delOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, ID),
        callback: async (req) => {
            await rssResultRep.deleteOneById(req.body[ID]);
        }
    },
    "/delMany": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, PID),
        callback: async (req) => {
            await rssResultRep.deleteByPid(req.body[PID]);
        }
    },
    "/hideOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => {
            checkBodyKeysNotBlank(req, [ID, HIDE]);
            if (![0, 1].some(hide => hide === req.body[HIDE])) {
                __throwMessage('Unsupported body value: hide.');
            }
        },
        callback: async (req) => {
            const { rows } = await rssResultRep.fakeDeleteOneById(req.body[ID], req.body[HIDE]);
            if (rows === 0) {
                __throwMessage('Hide one result failed. Cause: not exists.');
            }
        }
    },
    "/addOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => {
            checkBodyKeysNotBlank(req, [PID, TITLE, TORRENT]);
            checkBodyKeysExists(req, [PUB_DATE]);
        },
        callback: async (req) => {
            const { rows } = await addOneResult(req.body);
            if (rows === 0) {
                __throwMessage('Add one result failed. Cause: exists.');
            }
            return { rows }
        }
    },
    "/editOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => {
            checkBodyKeysNotBlank(req, [ID, TITLE, TORRENT]);
            checkBodyKeysExists(req, [PUB_DATE]);
        },
        callback: async (req) => {
            return editOneResult(req.body).then(({ rows }) => ({ rows }));
        }
    }
}