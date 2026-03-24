import { checkIp, getBlockIgnore, isIpBlockerDestroyed } from "../common/apiIpBlock.js";
import { getRequestRealIp } from "../common/httpUtil.js";

export default {
    order: -110,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        if (isIpBlockerDestroyed()) {
            resolve({ req, res, config });
        } else {
            const blockIgnoreApi = getBlockIgnore();
            const url = req.path;
            const realIp = getRequestRealIp(req);
            if (blockIgnoreApi.some(r => new RegExp(r).test(url)) || checkIp(realIp)) {
                resolve({ req, res, config });
            } else {
                req.destroy();
                reject({ msg: 'Forbidden.', code: -403, status: 403 });
            }
        }
    }
}