import { checkQueryKeyValue } from "../common/apiPreCheck.js";
import { storeSSE } from "../handler/sseHandler.js";

export default {
    '/events': {
        method: 'get',
        ignoreSecret: true,
        preCheck: req => checkQueryKeyValue(req, 'secret', 'mAou5820.sseEvents', { errorStatus: 400 }),
        ignoreReturn: true,
        callback: (req, res) => storeSSE(req, res)
    }
}