import { decryptData } from "../../modules/authorization/authorizationService.js"
import { getItem, setItem } from "./objectUtil.js"

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