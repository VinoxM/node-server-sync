import accountRep from "../repository/accountRep.js";
import { createToken, deleteToken, deleteTokenByUid, encryptData } from '../../authorization/authorizationService.js';

export async function registerAccount(uname, password) {
    const b = await accountRep.userExists(uname)
    if (!b) {
        const rows = await accountRep.insertOne(uname, password)
        if (rows === 1) {
            return;
        }
    }
    __throwMessage('User already exists.', -1)
}

export async function resetPassword(uname, password, newPassword) {
    const user = await accountRep.selectByUname(uname)
    if (!user || user.password !== password) {
        __throwMessage('Password incorrect.', -1)
    }
    if (password === newPassword) {
        __throwMessage('The new password cannot be the same as the old password.', -1)
    }
    const rows = await accountRep.updatePasswordByUname(uname, newPassword)
    if (rows === 0) {
        __throwMessage('Update password error.', -1)
    } else {
        await deleteTokenByUid(user.id)
    }
}

export async function userLogin(uname, password, clientId) {
    const userInfo = await accountRep.selectByUname(uname)
    if (!userInfo) {
        __throwMessage('User not exists.', -1)
    }
    if (userInfo?.password !== password) {
        __throwMessage('Password incorrect.', -1)
    }
    const tokenHash = await createToken({ id: userInfo.id, uname: userInfo.uname, clientId })
    return encryptData(tokenHash)
}

export async function userLogout(hash) {
    return deleteToken(hash)
}

export async function getUserByUnameAndPwd(uname, password) {
    return accountRep.selectByUnameAndPassword(uname, password)
}