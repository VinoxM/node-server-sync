import { checkBodyKeysNotBlank } from '../../common/apiPreCheck.js';
import { decryptionBodyKeys } from '../../common/apiPreHandle.js';
import { getTokenHash } from '../../common/httpUtil.js';
import apiMethodConst from '../../constraints/apiMethodConst.js';
import { createToken, deleteToken, deleteTokenByUid, encryptData } from '../../handler/account/authHandler.js';
import authRep from '../../repository/account/authRep.js';

const { POST } = apiMethodConst

const needSecret = () => 'mAou5820.authorization'

export default {
    basePath: "/auth",
    "/register": {
        disabled: true,
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uname', 'password']),
        preHandle: req => decryptionBodyKeys(req, ['password']),
        callback: async req => {
            const { uname, password } = req.body
            const b = await authRep.userExists(uname)
            if (!b) {
                const rows = await authRep.insertOne(uname, password)
                if (rows === 1) {
                    return;
                }
            } else {
                throwMessage('User already exists.', -1)
            }
        }
    },
    '/resetPassword': {
        disabled: true,
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uname', 'password', 'newPassword']),
        preHandle: req => decryptionBodyKeys(req, ['password', 'newPassword']),
        callback: async req => {
            const { uname, password, newPassword } = req.body
            const user = await authRep.selectByUname(uname)
            if (!user || user.password !== password) {
                throwMessage('Password incorrect.', -1)
            }
            if (password === newPassword) {
                throwMessage('The new password cannot be the same as the old password.', -1)
            }
            const rows = await authRep.updatePasswordByUname(uname, newPassword)
            if (rows === 0) {
                throwMessage('Update password error.', -1)
            } else {
                deleteTokenByUid(user.id)
            }
        }
    },
    '/login': {
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uname', 'password']),
        preHandle: req => decryptionBodyKeys(req, ['password']),
        callback: async req => {
            const { uname, password } = req.body
            const userInfo = await authRep.selectByUname(uname)
            if (!userInfo) {
                throwMessage('User not exists.', -1)
            }
            if (userInfo?.password !== password) {
                throwMessage('Password incorrect.', -1)
            }
            const tokenHash = createToken({ id: userInfo.id, uname: userInfo.uname }, '30m')
            return encryptData(tokenHash)
        }
    },
    '/logout': {
        method: POST,
        needSecret,
        needAuth: true,
        callback: req => {
            const hash = getTokenHash(req)
            return deleteToken(hash)
        }
    }
}