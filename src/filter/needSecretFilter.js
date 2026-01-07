import { getDefaultSecret } from "../common/configUtil.js";
import { checkHeaderKeyValue } from "../common/apiPreCheck.js";
import apiHeaderConst from "../constraints/apiHeaderConst.js";

export default {
    order: -80,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const { ignoreSecret, needSecret = getDefaultSecret } = config;
        try {
            (!ignoreSecret && needSecret && checkHeaderKeyValue(req, apiHeaderConst.SECRET, needSecret()));
        } catch (error) {
            return reject(error);
        }
        resolve({ req, res, config });
    },
}