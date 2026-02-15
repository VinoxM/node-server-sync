import { verifyToken } from "../handler/account/authHandler.js";

export default {
    order: -79,
    doFilter: async (resolve, reject, complete, { req, res, config }) => {
        const { needAuth } = config;
        const url = req.path;
        let authed = false
        const token = (req.headers?.['authorization'] ?? '').replace('Bearer ', '')
        try {
            if (isNotBlank(token) && await verifyToken(token, decode => req.userInfo = decode)) {
                authed = true
            }
        } catch (ignored) {
        }
        const needAuthApi = __env.get('api.needAuth', [])
        if (needAuth || needAuthApi.some(r => new RegExp(r).test(url))) {
            authed || throwMessage('Permission denied.', -12)
        }
        resolve({ req, res, config });
    },
}