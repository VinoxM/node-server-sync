import { decryptData } from "../../modules/authorization/authorizationService.js"
import { getItem, setItem } from "./objectUtil.js"

/**
 * 自动解密请求体中的加密字段（直接原地替换 `req.body` 中的密文为明文）
 * @param {import('express').Request} req - Express 请求对象
 * @param {string|string[]} bodyKeys - 需要解密的请求体字段路径或字段名数组
 */
export function decryptionBodyKeys(req, bodyKeys) {
    let keys = Array.isArray(bodyKeys) ? bodyKeys : [bodyKeys]
    for (const key of keys) {
        const keyValue = getItem(req.body ?? {}, key, null)
        if (keyValue !== null) {
            let decryptedKeyValue
            try {
                decryptedKeyValue = decryptData(keyValue)
            } catch (e) {
                __log.error(`Decrypt bodyKey error: ${key}.`, e)
                continue
            }
            setItem(req.body, key, decryptedKeyValue)
        }
    }
}