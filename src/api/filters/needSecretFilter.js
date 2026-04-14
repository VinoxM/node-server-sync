import apiHeaderConst, { defaultSecret } from "../../common/constants/apiHeaderConst.js";
import { checkHeaderKeyValue } from "../../common/utils/preCheckUtil.js";

function getDefaultSecret() {
    return __env.get('api.defaultSecret', defaultSecret)
}

export default {
    order: -80,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const { ignoreSecret, needSecret = getDefaultSecret } = config;
        try {
            (!ignoreSecret && needSecret && checkHeaderKeyValue(req, apiHeaderConst.SECRET, btoa(needSecret())));
        } catch (error) {
            return reject(error);
        }
        resolve({ req, res, config });
    },
}