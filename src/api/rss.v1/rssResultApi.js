import apiMethodConst from '../../constraints/apiMethodConst.js';
import apiBodyConst from '../../constraints/apiBodyConst.js';
import rssResultRep from '../../repository/rss/rssResultRep.js';
import { addOneResult, editOneResult } from '../../handler/rss/rssResultHandler.js';
import { checkBodyKeyNotBlank, checkBodyKeysNotBlank, checkBodyKeysExists } from '../../common/apiPreCheck.js';

const { POST } = apiMethodConst;
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
                throwMessage('Unsupported body value: hide.');
            }
        },
        callback: async (req) => {
            const { rows } = await rssResultRep.fakeDeleteOneById(req.body[ID], req.body[HIDE]);
            if (rows === 0) {
                throwMessage('Hide one result failed. Cause: not exists.');
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
                throwMessage('Add one result failed. Cause: exists.');
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
        callback: (req) => {
            return editOneResult(req.body).then(({ rows }) => ({ rows }));
        }
    }
}