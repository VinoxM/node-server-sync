import { allowLanHosts } from "../../common/constants/allowHostsConst.js";
import { checkQueryKeyValue } from "../../common/utils/preCheckUtil.js";
import { storeSSE } from "../../modules/socket/sseStorage.js";

export default {
    '/events': {
        method: 'get',
        allowHosts: allowLanHosts,
        ignoreTrace: true,
        ignoreSecret: true,
        preCheck: req => checkQueryKeyValue(req, 'secret', 'mAou5820.sseEvents', { errorStatus: 400 }),
        ignoreReturn: true,
        callback: (req, res) => storeSSE(req, res)
    }
}