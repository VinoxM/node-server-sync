import { getToken, getNeedTokenApi, isBucketDestroyed } from "../common/apiTokenBucket.js";

export default {
    order: -100,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        if (isBucketDestroyed()) {
            resolve({ req, res, config });
        } else {
            const needTokenApi = getNeedTokenApi();
            const url = req.path;
            if (!needTokenApi.some(r => new RegExp(r).test(url)) || getToken()) {
                resolve({ req, res, config });
            } else {
                reject({ msg: `Service access restriction.`, code: -9 });
            }
        }
    }
}