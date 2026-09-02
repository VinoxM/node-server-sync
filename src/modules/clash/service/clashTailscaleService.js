import fs from 'fs';
import path from 'path';
import clashConst from '../constants/clashFileNameConst.js';
import yaml from 'yaml';
import { getItem } from '#utils/objectUtil.js';

/**
 * @typedef {import('@types/clashTypes.d.ts').ClashConfig} ClashConfig
 */

/**
 * 将 Tailscale 专用的代理节点与分流规则融合追加到给定的 Clash 配置中
 * 1. 读取 `clash.path.tailscale` 目录下的 proxy-conf.yaml 并追加到 proxies 列表
 * 2. 读取 rules-conf.yaml 并前置插入到 rules 列表
 * @param {ClashConfig} data - 基础 Clash 配置对象
 * @returns {ClashConfig} 融合 Tailscale 后的新配置对象副本
 */
export function concatTailscale(data) {
    const dataObj = structuredClone(data);
    const tailscaleConfPath = __env.get('clash.path.tailscale');
    if (__isBlank(tailscaleConfPath)) {
        __log.warn('[Clash Tailscale] Tailscale config path is blank.');
        return dataObj;
    }
    // 1. 读取并合并 Tailscale proxies 配置
    const PROXY_CONF_PATH = path.join(tailscaleConfPath, clashConst.TAILSCALE_PROXY_FILE_NAME);
    if (!fs.existsSync(PROXY_CONF_PATH) || !fs.lstatSync(PROXY_CONF_PATH).isFile()) {
        __log.warn('[Clash Tailscale] Tailscale proxy conf file is not exists.');
        return dataObj;
    }
    const proxies = tryReadFileProperty(PROXY_CONF_PATH, 'proxies');
    if (!proxies || __isEmptyArray(proxies)) {
        __log.warn('[Clash Tailscale] Tailscale proxies is empty.');
        return dataObj;
    }
    dataObj.proxies = [...(dataObj.proxies || []), ...proxies];

    // 2. 读取并合并 Tailscale rules 配置 (前置插入)
    const RULES_CONF_PATH = path.join(tailscaleConfPath, clashConst.TAILSCALE_RULES_FILE_NAME);
    if (!fs.existsSync(RULES_CONF_PATH) || !fs.lstatSync(RULES_CONF_PATH).isFile()) {
        __log.warn('[Clash Tailscale] Tailscale rules conf file is not exists.');
        return dataObj;
    }
    const rules = tryReadFileProperty(RULES_CONF_PATH, 'rules');
    if (!rules || __isEmptyArray(rules)) {
        __log.warn('[Clash Tailscale] Tailscale rules is empty.');
        return dataObj;
    }
    dataObj.rules = [...rules, ...(dataObj.rules || [])];
    return dataObj;
}

/**
 * 读取 YAML 文件并提取指定属性路径的值
 * @param {string} filePath - 文件路径
 * @param {string} property - 属性名
 * @returns {any} 提取到的属性值或 null
 */
function tryReadFileProperty(filePath, property) {
    try {
        const fileStr = fs.readFileSync(filePath).toString();
        const obj = yaml.parse(fileStr);
        return getItem(obj, property);
    } catch (ex) {
        __log.error(`[Clash Tailscale] Read yaml file[${filePath}] obj property[${property}] failed. Cause:`, ex.message ?? ex);
        return null;
    }
}