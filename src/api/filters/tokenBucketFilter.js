import { GetterContextSubscribe } from "../../core/context/subscribe.js";
import { tokenBucket } from "../../core/instance/tokenBucket.js";

const needTokenApiSubscribe = new GetterContextSubscribe('NeedTokenApi', () => __env.get('api.tokenBucket.needToken', []).map(r => new RegExp(r)))

export default {
    order: -100,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        if (!tokenBucket.ready()) {
            resolve({ req, res, config });
        } else {
            const url = req.path;
            if (!needTokenApiSubscribe.getValue().some(r => r.test(url)) || tokenBucket.getToken()) {
                resolve({ req, res, config });
            } else {
                reject({ msg: `Too Many Requests.`, code: -429, status: 429 });
            }
        }
    }
}