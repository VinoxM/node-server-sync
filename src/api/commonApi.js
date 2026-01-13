import apiMethodConst from '../constraints/apiMethodConst.js';
import { reloadApplicationContext } from '../support.js';
import { startTokenBucket } from '../common/apiTokenBucket.js';
import { startIpBlocker,cleanBlocker, unblockIp } from '../common/apiIpBlock.js';
import { getRequestRealIp } from '../common/httpUtil.js';
import { doAnimeGroup } from '../handler/animeGroupHandler.js';

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
            return startTokenBucket();
        }
    },
    "/resetIpBlocker": {
        method: POST,
        needSecret,
        callback: () => {
            return startIpBlocker();
        }
    },
    "/cleanIpBlocker": {
        method: POST,
        needSecret,
        callback: () => {
            return cleanBlocker();
        }
    },
    "/unblockIp": {
        method: POST,
        needSecret: () => "common.unblocked",
        callback: (req) => {
            const realIp = getRequestRealIp(req);
            return unblockIp(realIp);
        }
    },
    "/animeGroup": {
        method: GET,
        needSecret: false,
        callback: () => {
            doAnimeGroup();
            return 'ok';
        }
    },
    "/doNothing": {
        method: GET,
        needSecret: () => 'mAou5820.doNothing',
        callback: () => "Ok"
    }
}