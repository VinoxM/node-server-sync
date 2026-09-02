import { defineFilter } from "#utils/defineUtil.js";
import { getRequestRealIp, getRequestHost } from "#utils/requestUtil.js";
import ipaddr from 'ipaddr.js';
import pm from 'picomatch';

/**
 * 校验指定 IP 是否属于目标 CIDR 子网掩码范围 (如 192.168.1.0/24)
 * @param {string} inputIp - 待检测的 IP 地址
 * @param {string} cidr - CIDR 子网表示字符串
 * @returns {boolean} 是否属于该子网
 */
function checkSubnet(inputIp, cidr) {
    try {
        const addr = ipaddr.parse(inputIp);
        const [range, bits] = ipaddr.parseCIDR(cidr);
        if (addr.kind() === range.kind()) {
            return addr.match(range, bits);
        }
    } catch (ex) {
        __log.error(`[Allow Hosts] Check subnet failed.`, ex?.message || ex);
    }
    return false;
}

/**
 * 汇总当前请求可用的白名单 Host 与 CIDR 规则（合并路由配置项与全局配置项）
 * @param {string} [url=''] - 请求 URL 路径
 * @param {import('#types/routeTypes.d.ts').ApiRouteConfig} config - 路由配置对象
 * @param {Array<{ api?: string, hosts?: string[], cidr?: string[] }>} [allowHostsOptions=[]] - 全局白名单配置
 * @returns {{ allowHosts: string[], allowCIDR: string[] }} 合并后的 Host 白名单与 CIDR 白名单
 */
function getAllowHosts(url = '', config, allowHostsOptions = []) {
    const allowHosts = Array.from(config?.allowHosts ?? []);
    const allowCIDR = Array.from(config?.allowCIDR ?? []);
    for (const opt of allowHostsOptions) {
        if (opt?.api && urlMatch(url, opt?.api)) {
            allowHosts.push(...(opt?.hosts || []));
            allowCIDR.push(...(opt?.cidr || []));
        }
    }
    return { allowHosts, allowCIDR };
}

/**
 * 判断 URL 是否匹配正则表达式字符串
 * @param {string} url - 待匹配的 URL
 * @param {string} reg - 正则表达式字符串
 * @returns {boolean} 是否匹配
 */
function urlMatch(url, reg) {
    try {
        return new RegExp(reg).test(url);
    } catch (ex) {
        __log.error(`[Allow Hosts] UrlMatch failed.`, ex?.message || ex);
    }
    return false;
}

/**
 * 访问来源白名单过滤器
 * 优先级: -120
 * 作用: 校验客户端 Host 域名与来源 IP (CIDR) 是否在允许的白名单范围内
 */
export default defineFilter({
    order: -120,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const realIp = getRequestRealIp(req);
        const host = getRequestHost(req);
        const url = req.path;
        const allowHostsOptions = __env.get('api.allowHosts', []);
        const { allowHosts, allowCIDR } = getAllowHosts(url, config, allowHostsOptions);
        const hostMatcher = pm(allowHosts);
        if (allowHosts.length > 0 && !hostMatcher(host)) {
            reject({ msg: 'Host Not Allowed.', code: -403, status: 403 });
        } else if (allowCIDR.length > 0 && !allowCIDR.some(cidr => checkSubnet(realIp, cidr))) {
            reject({ msg: 'Not Allowed.', code: -403, status: 403 });
        } else {
            resolve({ req, res, config });
        }
    }
});