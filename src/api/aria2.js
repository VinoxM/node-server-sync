import { checkBodyKeysNotBlank } from "../common/apiPreCheck.js";
import apiMethodConst from "../constraints/apiMethodConst.js";
import { addTorrent } from "../handler/aria2Handler.js";

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.aria2"

export default {
    basePath: "/aria2",
    "/addTorrent": {
        method: POST,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['torrent']),
        callback: (req) => {
            return addTorrent(req.body.torrent)
        }
    }
}