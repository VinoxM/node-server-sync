import { GetterContextSubscribe } from "../context/subscribe.js";
import { decodeAuthorization } from "../handler/account/authHandler.js";

const needAuthApiRegex = new GetterContextSubscribe('NeedAuthApi', () => __env.get('api.needAuth', []).map(r => new RegExp(r)))

export default {
    order: -79,
    doFilter: async (resolve, reject, complete, { req, res, config }) => {
        const { needAuth } = config;
        if (needAuth || needAuthApiRegex.getValue().some(r => r.test(req.path))) {
            const userInfo = await decodeAuthorization(req)
            userInfo || throwMessage('Permission denied.', -401, 401)
            req.userInfo = userInfo
        }
        resolve({ req, res, config });
    },
}