import apiMethodConst from "../../../common/constants/apiMethodConst.js";
import apiBodyConst from "../../../common/constants/apiBodyConst.js";
import { checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from "../../../common/utils/preCheckUtil.js";
import rssResultRep from "../../../modules/rss/repository/rssResultRep.js";
import { addOneResult, editOneResult, getEpisodeMatches } from "../../../modules/rss/service/rssResultService.js";

const { POST, GET } = apiMethodConst;
const { ID, PID, TORRENT, TITLE, PUB_DATE, HIDE } = apiBodyConst;

export default {
    basePath: "/rss/result",
    "/delOne": {
        method: POST,
        preCheck: (req) => checkBodyKeyNotBlank(req, ID),
        callback: async (req) => {
            await rssResultRep.deleteOneById(req.body[ID]);
        }
    },
    "/delMany": {
        method: POST,
        preCheck: (req) => checkBodyKeyNotBlank(req, PID),
        callback: async (req) => {
            await rssResultRep.deleteByPid(req.body[PID]);
        }
    },
    "/hideOne": {
        method: POST,
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
        preCheck: (req) => {
            checkBodyKeysNotBlank(req, [ID, TITLE, TORRENT]);
            checkBodyKeysExists(req, [PUB_DATE]);
        },
        callback: async (req) => {
            return editOneResult(req.body).then(({ rows }) => ({ rows }));
        }
    },
    '/getEpisodeMatchers': {
        method: GET,
        ignoreOutput: true,
        callback: () => getEpisodeMatches()
    }
}