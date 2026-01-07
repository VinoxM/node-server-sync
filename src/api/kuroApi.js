import { checkBodyKeyNotBlank, checkBodyKeysNotBlank } from '../common/apiPreCheck.js';
import { kuroGameSign, kuroTokenLogin, kuroLogout, kuroGameSignAll, kuroSignGameUpdate } from '../handler/kuroHandler.js';

const needSecret = () => "mAou5820.kuro";

export default {
    basePath: "/kuro",
    '/sdkLogin': {
        method: 'post',
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['code', 'uid', 'mobile']),
        callback: (req) => {
            return kuroSDKLogin(req.body);
        }
    },
    '/tokenLogin': {
        method: 'post',
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, 'token'),
        callback: (req) => {
            return kuroTokenLogin(req.body.token, req.body.signGames);
        }
    },
    '/logout': {
        method: 'post',
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, 'uid'),
        callback: (req) => {
            return kuroLogout(req.body.uid)
        }
    },
    '/updateSignGame': {
        method: 'post',
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, 'uid') && checkBodyKeysExists(req, ['signGames']),
        callback: (req) => {
            return kuroSignGameUpdate(req.body.uid, req.body.signGames);
        }
    },
    '/gameSign': {
        method: 'post',
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['uid', 'gameId']),
        callback: (req) => {
            return kuroGameSign(req.body.uid, null, req.body.gameId);
        }
    },
    '/gameSignAll': {
        method: 'post',
        needSecret,
        callback: () => {
            return kuroGameSignAll()
        }
    }
}