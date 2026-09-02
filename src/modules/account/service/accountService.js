import accountRep from '#modules/account/repository/accountRep.js';
import { createToken, deleteToken, deleteTokenByUid, encryptData } from '#modules/authorization/authorizationService.js';

/**
 * 注册新用户账户
 * @param {string} uname - 用户名
 * @param {string} password - 用户密码（加密后的密文）
 * @returns {Promise<void>}
 * @throws {object} 当用户名已存在或插入失败时抛出错误消息
 */
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

/**
 * 重置/修改用户密码
 * @param {string} uname - 用户名
 * @param {string} password - 原密码密文
 * @param {string} newPassword - 新密码密文
 * @returns {Promise<void>}
 * @throws {object} 当原密码不正确、新旧密码相同或更新失败时抛出错误消息
 */
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

/**
 * 用户登录认证
 * @param {string} uname - 用户名
 * @param {string} password - 密码密文
 * @param {string} clientId - 客户端标识 ID
 * @returns {Promise<string>} AES 加密后的 Token 凭证密文
 * @throws {object} 当用户不存在或密码错误时抛出错误消息
 */
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

/**
 * 用户退出登录（销毁当前 Token 凭证）
 * @param {string} hash - 当前 Token 哈希
 * @returns {Promise<boolean>} 是否成功删除
 */
export async function userLogout(hash) {
    return deleteToken(hash)
}

/**
 * 根据用户名和密码凭据获取用户基础信息
 * @param {string} uname - 用户名
 * @param {string} password - 密码密文
 * @returns {Promise<{ id: number, uname: string }|null>} 用户对象
 */
export async function getUserByUnameAndPwd(uname, password) {
    return accountRep.selectByUnameAndPassword(uname, password)
}