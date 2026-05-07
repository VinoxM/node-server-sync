import apiMethodConst from "../../common/constants/apiMethodConst.js";
import { getRequestRealIp } from "../../common/utils/requestUtil.js";
import { ipBlocker } from "../../core/instance/ipBlocker.js";
import { tokenBucket } from "../../core/instance/tokenBucket.js";
import { reloadApplicationContext } from "../../support.js";

const { POST, GET } = apiMethodConst;

const needSecret = () => "mAou5820.common"

export default {
    basePath: "/common",
    "/reloadApplicationConfig": {
        method: POST,
        needSecret,
        callback: () => {
            return reloadApplicationContext();
        }
    },
    "/resetTokenBucket": {
        method: POST,
        needSecret,
        callback: () => {
            return tokenBucket.start();
        }
    },
    "/resetIpBlocker": {
        method: POST,
        needSecret,
        callback: () => {
            return ipBlocker.start();
        }
    },
    "/cleanIpBlocker": {
        method: POST,
        needSecret,
        callback: () => {
            return ipBlocker.clean();
        }
    },
    "/unblockIp": {
        method: POST,
        needSecret: () => "common.unblocked",
        callback: (req) => {
            const realIp = getRequestRealIp(req);
            return ipBlocker.unblock(realIp);
        }
    },
    "/getSupportedSshExecutors": {
        method: GET,
        allowHosts: ['server.vinoxm.name', '28000--main--code-server--maou864--coder.vinoxm.cloud'],
        needSecret,
        callback: () => {
            const opts = __env.get('ssh', {})
            return Array.from(Object.keys(opts))
        }
    },
    "/doNothing": {
        method: GET,
        needSecret: () => 'mAou5820.doNothing',
        callback: () => "Ok"
    }
}