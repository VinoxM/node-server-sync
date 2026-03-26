import apiMethodConst from "../../common/constants/apiMethodConst.js";
import { checkBodyKeysNotBlank } from "../../common/utils/preCheckUtil.js";
import * as qbitService from '../../modules/download/qbitorrentService.js'

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
            return qbitService.addTorrent(req.body.torrent)
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
            return qbitService.torrentInfo(req.body.uuid, req.body.hash)
        }
    },
    "/qbit/torrentFiles": {
        method: POST,
        needSecret,
        allowCIDR,
        ignoreOutput: true,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['hash']),
        callback: (req) => {
            return qbitService.torrentFiles(req.body.hash)
        }
    },
    "/qbit/delTorrent": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['hash']),
        callback: (req) => {
            return qbitService.deleteTorrent(req.body.hash, true)
        }
    },
}