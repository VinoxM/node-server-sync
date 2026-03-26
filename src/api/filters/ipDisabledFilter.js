import { ipBlocker } from "../../core/instance/ipBlocker.js";
import { getRequestRealIp } from "../../common/utils/requestUtil.js";
import { GetterContextSubscribe } from "../../core/context/subscribe.js";

const ipBlockIgnoreRegex = new GetterContextSubscribe('ipBlockIgnore', () => __env.get("api.ipBlocker.blockIgnore", []).map(r => new RegExp(r)))

export default {
    order: -110,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        if (!ipBlocker.ready()) {
            resolve({ req, res, config });
        } else {
            const url = req.path;
            const realIp = getRequestRealIp(req);
            if (ipBlockIgnoreRegex.getValue().some(r => r.test(url)) || checkIp(realIp)) {
                resolve({ req, res, config });
            } else {
                req.destroy();
                reject({ msg: 'Forbidden.', code: -403, status: 403 });
            }
        }
    }
}