import apiMethodConst from '../../../common/constants/apiMethodConst.js';
import { checkBodyKeysNotBlank } from '../../../common/utils/preCheckUtil.js';
import { decryptionBodyKeys } from '../../../common/utils/preHandleUtil.js';
import { getRequestTokenHash } from '../../../common/utils/requestUtil.js';
import { registerAccount, resetPassword, userLogin, userLogout } from '../../../modules/account/service/accountService.js';
import { decodeAuthorization, verifyClient } from '../../../modules/authorization/authorizationService.js';

const { POST } = apiMethodConst

const needSecret = () => 'mAou5820.authorization'

export default {
    basePath: "/auth",
    "/register": {
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uname', 'password']),
        preHandle: req => decryptionBodyKeys(req, ['password']),
        callback: async req => registerAccount(req.body.uname, req.body.password)
    },
    '/resetPassword': {
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uname', 'password', 'newPassword']),
        preHandle: req => decryptionBodyKeys(req, ['password', 'newPassword']),
        callback: async req => resetPassword(req.body.uname, req.body.password, req.body.newPassword)
    },
    '/login': {
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uname', 'password']),
        preHandle: req => decryptionBodyKeys(req, ['password']),
        callback: async req => {
            const clientId = verifyClient(req)
            return userLogin(req.body.uname, req.body.password, clientId)
        }
    },
    '/logout': {
        method: POST,
        needSecret,
        needAuth: true,
        callback: req => {
            const hash = getRequestTokenHash(req)
            return userLogout(hash)
        }
    },
    '/checkAuth': {
        method: POST,
        needSecret,
        needAuth: true,
        callback: req => decodeAuthorization(req).then(userInfo => userInfo?.uname)
    }
}