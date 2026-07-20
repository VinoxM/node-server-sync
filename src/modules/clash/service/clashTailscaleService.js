import fs from 'fs';
import path from 'path';
import clashConst from '../constants/clashFileNameConst.js';
import yaml from 'yaml';
import { getItem } from '../../../common/utils/objectUtil.js';

export function concatTailscale(data) {
    const dataObj = structuredClone(data)
    const tailscaleConfPath = __env.get('clash.path.tailscale')
    if (__isBlank(tailscaleConfPath)) {
        __log.warn('[Clash Tailscale] Tailscale config path is blank.')
        return dataObj;
    }
    // proxies conf
    const PROXY_CONF_PATH = path.join(tailscaleConfPath, clashConst.TAILSCALE_PROXY_FILE_NAME)
    if (!fs.existsSync(PROXY_CONF_PATH) || !fs.lstatSync(PROXY_CONF_PATH).isFile()) {
        __log.warn('[Clash Tailscale] Tailscale proxy conf file is not exists.')
        return dataObj;
    }
    const proxies = tryReadFileProperty(PROXY_CONF_PATH, 'proxies')
    if (!proxies || __isEmptyArray(proxies)) {
        __log.warn('[Clash Tailscale] Tailscale proxies is empty.')
        return dataObj;
    }
    dataObj.proxies = [...dataObj.proxies, ...proxies]
    // rules conf    
    const RULES_CONF_PATH = path.join(tailscaleConfPath, clashConst.TAILSCALE_RULES_FILE_NAME)
    if (!fs.existsSync(RULES_CONF_PATH) || !fs.lstatSync(RULES_CONF_PATH).isFile()) {
        __log.warn('[Clash Tailscale] Tailscale rules conf file is not exists.')
        return dataObj;
    }
    const rules = tryReadFileProperty(RULES_CONF_PATH, 'rules')
    if (!rules || __isEmptyArray(rules)) {
        __log.warn('[Clash Tailscale] Tailscale rules is empty.')
        return dataObj;
    }
    dataObj.rules = [...rules, ...dataObj.rules]
    return dataObj
}

function tryReadFileProperty(filePath, property) {
    try {
        const fileStr = fs.readFileSync(filePath).toString()
        const obj = yaml.parse(fileStr)
        return getItem(obj, property)
    } catch (ex) {
        __log.error(`[Clash Tailscale] Read yaml file[${filePath}] obj property[${property}] failed. Cause:`, ex.message ?? ex)
        return null;
    }
}