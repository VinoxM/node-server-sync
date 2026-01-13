import { checkBodyKeysNotBlank } from "../common/apiPreCheck.js";
import apiMethodConst from "../constraints/apiMethodConst.js";
import { addTorrent as aria2AddTorrent } from "../handler/download/aria2Handler.js";
import { addTorrent as qbitAddTorrent } from "../handler/download/qbitorrentHandler.js";
import { addTorrent as transmissionAddTorrent } from "../handler/download/transmissionHandler.js";

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.download"

export default {
    basePath: "/download",
    "/aria2/addTorrent": {
        method: POST,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['torrent']),
        callback: (req) => {
            return aria2AddTorrent(req.body.torrent)
        }
    },
    "/qbit/addTorrent": {
        method: POST,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['torrent']),
        callback: (req) => {
            return qbitAddTorrent(req.body.torrent)
        }
    },
    "/transmission/addTorrent": {
        method: POST,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['torrent']),
        callback: (req) => {
            return transmissionAddTorrent(req.body.torrent)
        }
    }
}