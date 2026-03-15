import { checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { checkVideoFilterRules, handleFilterRule } from "../../handler/media/mediaFilterHandler.js"
import { MEDIA_ALLOW_CIDR as allowCIDR } from "../../constraints/mediaConst.js"

const { POST } = apiMethodConst

const needSecret = () => "mAou5820.media.video"

export default {
    basePath: "/media",    
    "/filterRules/add": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'type', 'value', 'operator']),
        callback: req => handleFilterRule(req.body)
    },
    "/filterRules/remove": {
        method: POST,
        needSecret,
        allowCIDR,
        preCheck: req => checkBodyKeysNotBlank(req, ['category', 'type', 'value', 'operator']),
        callback: req => handleFilterRule(req.body, false)
    },
    "/filterRules/validate": {
        method: POST,
        needSecret,
        allowCIDR,
        ignoreOutput: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['category']) && checkBodyKeyNotEmptyArray(req, 'rules'),
        callback: req => checkVideoFilterRules(req.body)
    }
}