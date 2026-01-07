import { verifyToken } from "../handler/account/authHandler.js";

export default {
    order: -79,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const { needAuth } = config;
        try {
            if (needAuth) {
                const token = (req.headers?.['authorization'] ?? '').replace('Bearer ', '')
                if (isBlank(token) || !verifyToken(token, decode => req.userInfo = decode)) {
                    throwMessage('Permission denied.', -12)
                }
            }
        } catch (error) {
            return reject(error);
        }
        resolve({ req, res, config });
    },
}