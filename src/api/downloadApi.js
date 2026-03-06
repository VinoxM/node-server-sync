import { checkBodyKeysNotBlank } from "../common/apiPreCheck.js";
import apiMethodConst from "../constraints/apiMethodConst.js";
import * as qbitHandler from "../handler/download/qbitorrentHandler.js";

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.download"

const allowCIDR = [
    '192.168.31.0/24',
    '172.17.0.0/24',
    '127.0.0.1'
]

export default {
    basePath: "/download",
    "/qbit/addTorrent": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['torrent']),
        callback: (req) => {
            return qbitHandler.addTorrent(req.body.torrent)
        }
    },
    "/qbit/torrentInfo": {
        method: POST,
        needSecret,
        allowCIDR,
        ignoreOutput: true,
        preCheck: (req) => {
            try {
                checkBodyKeysNotBlank(req, ['uuid'])
            } catch (ignored) {
                checkBodyKeysNotBlank(req, ['hash'])
            }
        },
        callback: (req) => {
            return qbitHandler.torrentInfo(req.body.uuid, req.body.hash)
        }
    },
    "/qbit/torrentFiles": {
        method: POST,
        needSecret,
        allowCIDR,
        ignoreOutput: true,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['hash']),
        callback: (req) => {
            return qbitHandler.torrentFiles(req.body.hash)
        }
    },
    "/qbit/delTorrent": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['hash']),
        callback: (req) => {
            return qbitHandler.deleteTorrent(req.body.hash, true)
        }
    },
}