import fs from 'fs';
import yaml from 'yaml';
import clashConst from '../constants/clashFileNameConst.js';
import { pushNotification } from '#api/sockets/notification.js';
import { getUrlFull } from '#utils/httpUtil.js';

/**
 * @typedef {import('#types/clashTypes.d.ts').ClashSubscriptionResult} ClashSubscriptionResult
 * @typedef {import('#types/clashTypes.d.ts').ClashSubscriptionSourceObj} ClashSubscriptionSourceObj
 */

/**
 * 从本地缓存中读取主订阅源的用户用量信息 (subscription-userinfo)
 * @returns {string} 用量信息字符串 (如 `upload=123; download=456; total=789; expire=123456`)
 */
function getSubscribeInfo() {
    const subscriptionPath = __env.get('clash.path.subscription', '@/');
    const subInfoFile = __join(subscriptionPath, clashConst.SUBSCRIBE_INFO_FILE_NAME);
    if (fs.existsSync(subInfoFile)) {
        return fs.readFileSync(subInfoFile).toString();
    }
    return '';
}

/**
 * 保存主订阅源的用户用量信息到本地缓存文件
 * @param {string} [label='Unknown'] - 订阅源标识
 * @param {string} subInfo - 用量信息字符串
 */
function saveSubscribeInfo(label = 'Unknown', subInfo) {
    if (__isBlank(subInfo)) return;
    const subscriptionPath = __env.get('clash.path.subscription', '@/');
    const subInfoFile = __join(subscriptionPath, clashConst.SUBSCRIBE_INFO_FILE_NAME);
    if (!fs.existsSync(subscriptionPath)) {
        fs.mkdirSync(subscriptionPath, { recursive: true });
    }
    fs.writeFileSync(subInfoFile, subInfo);
    __log.info(`[Clash Subscribe] Save clash source[${label}] subInfo success.`);
}

/**
 * 并发拉取并更新所有配置的远程 Clash 订阅源
 * @param {string} [from] - 触发源标识 (如定时任务名或操作人，用于推送通知)
 * @returns {Promise<ClashSubscriptionResult>} 订阅同步统计结果
 */
async function subscribeSources(from) {
    const result = { success: 0, skipped: 0, failed: 0 };
    const subscription = __env.get('clash.subscription', {});
    const sources = Array.from(subscription.sources ?? []);
    if (sources.length === 0) {
        __log.warn('[Clash Subscribe] Subscribe clash sources skipped, cause sources empty.');
        return result;
    }
    for (const source of sources) {
        const { url, label, isDefault = false } = source;
        if (__isBlank(label)) {
            result.skipped++;
            continue;
        }
        if (__isBlank(url)) {
            __log.warn(`[Clash Subscribe] Subscribe clash source[${label}] skipped.`);
            result.skipped++;
            continue;
        }
        await getUrlFull(url).then(res => {
            if (isDefault) {
                const subInfo = res.headers['subscription-userinfo'];
                saveSubscribeInfo(label, subInfo);
                pushSubscribedInfoNotification(subInfo, from);
            }
            saveSubscription(res.data, label);
            result.success++;
        }).catch(ex => {
            __log.error(`[Clash Subscribe] Subscribe clash source[${label}] failed.`, ex);
            result.failed++;
        });
    }
    return result;
}

/**
 * 保存单个订阅源拉取到的 YAML 配置文件及更新时间戳
 * @param {string} data - YAML 文本内容
 * @param {string} label - 订阅源标识
 */
function saveSubscription(data, label) {
    const subscriptionPath = __env.get('clash.path.subscription', '@/');
    const subscribeClashFile = __join(subscriptionPath, label + '.yaml');
    const subscribeClashUpdateTimeFile = __join(subscriptionPath, label + '.datetime');
    if (!fs.existsSync(subscriptionPath)) {
        fs.mkdirSync(subscriptionPath, { recursive: true });
    }
    fs.writeFileSync(subscribeClashFile, data);
    fs.writeFileSync(subscribeClashUpdateTimeFile, new Date().getTime() + '');
    __log.info(`[Clash Subscribe] Subscription[${label}] saved: `, subscribeClashFile);
}

/**
 * 读取本地缓存的所有订阅源并解析为 JavaScript 对象
 * @returns {ClashSubscriptionSourceObj[]} 解析后的订阅源列表
 */
function getSubscriptionSourcesObj() {
    const subscriptionPath = __env.get('clash.path.subscription', '@/');
    const subscription = __env.get('clash.subscription', {});
    const sources = Array.from(subscription.sources ?? []);
    return sources.map(source => {
        const { label } = source;
        if (__isBlank(label)) {
            return null;
        }
        const subscribeClashFile = __join(subscriptionPath, label + '.yaml');
        let obj = null;
        try {
            const objStr = fs.readFileSync(subscribeClashFile).toString();
            obj = yaml.parse(objStr);
        } catch (ex) {
            __log.error(`[Clash Subscribe] Parse clash source[${label}] failed.`, ex);
        }
        return obj === null ? null : { label, obj };
    }).filter(o => o !== null);
}

/**
 * 解析用量信息并通过 WebSocket/Socket 推送系统通知
 * @param {string} subInfo - 用量字符串
 * @param {string} [from] - 触发源标识
 */
function pushSubscribedInfoNotification(subInfo, from) {
    if (!subInfo) return;
    let info = subInfo.split('; ');
    const message = { event: 'Clash Subscribe' };
    info.forEach(str => {
        const kv = str.split('=');
        if (kv.length === 2) {
            message[kv[0]] = kv[1];
        }
    });
    pushNotification(JSON.stringify(message), from);
}

export {
    getSubscribeInfo,
    getSubscriptionSourcesObj,
    subscribeSources
};