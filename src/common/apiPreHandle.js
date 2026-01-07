import { decryptData } from "../handler/account/authHandler.js"
import { getItemOrElse, setItemSilently } from "./objectUtil.js"

export function decryptionBodyKeys(req, bodyKeys) {
    let keys = Array.isArray(bodyKeys) ? bodyKeys : [bodyKeys]
    for (const key of keys) {
        const keyValue = getItemOrElse(req.body ?? {}, key, null)
        if (keyValue !== null) {
            let decryptedKeyValue
            try {
                decryptedKeyValue = decryptData(keyValue)            
            } catch (e) {
                error(`Decrypt bodyKey error: ${key}.`, e)
                continue
            }
            setItemSilently(req.body, key, decryptedKeyValue)
        }
    }
}