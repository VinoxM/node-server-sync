import { getRequestHost, getRequestRealIp } from "../common/httpUtil.js";
import ipaddr from 'ipaddr.js'
import pm from 'picomatch'

function checkSubnet(inputIp, cidr) {
    try {
        const addr = ipaddr.parse(inputIp);
        const [range, bits] = ipaddr.parseCIDR(cidr);
        if (addr.kind() === range.kind()) {
            return addr.match(range, bits);
        }
    } catch (ex) {
        error(`[Allow Hosts] Check subnet failed.`, ex?.message || ex)
    }
    return false;
}

function getAllowHosts(url = '', config, allowHostsOptions = []) {
    const allowHosts = Array.from(config?.allowHosts ?? [])
    const allowCIDR = Array.from(config?.allowCIDR ?? [])
    for (const opt of allowHostsOptions) {
        if (opt?.api && urlMatch(url, opt?.api)) {
            allowHosts.push(...(opt?.hosts || []))
            allowCIDR.push(...(opt?.cidr || []))
        }
    }
    return { allowHosts, allowCIDR }
}

function urlMatch(url, reg) {
    try {
        return new RegExp(reg).test(url)
    } catch (ex) {
        error(`[Allow Hosts] UrlMatch failed.`, ex?.message || ex)
    }
    return false
}

export default {
    order: -120,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const realIp = getRequestRealIp(req);
        const host = getRequestHost(req);
        const url = req.path;
        const allowHostsOptions = __env.get('api.allowHosts', [])
        const { allowHosts, allowCIDR } = getAllowHosts(url, config, allowHostsOptions)
        const hostMatcher = pm(allowHosts)
        if (allowHosts.length > 0 && !hostMatcher(host)) {
            reject({ msg: 'Host Not Allowed.', code: -403, status: 403 })
        } else if (allowCIDR.length > 0 && !allowCIDR.some(cidr => checkSubnet(realIp, cidr))) {
            reject({ msg: 'Not Allowed.', code: -403, status: 403 })
        } else {
            resolve({ req, res, config });
        }
    }
}