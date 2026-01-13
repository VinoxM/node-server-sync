import fs from 'fs';
import yaml from 'yaml';
import clashConst from '../../constraints/clashFileNameConst.js';
import { pushNotification } from '../../sockets/notification.js';
import { getUrlFull } from '../../common/httpUtil.js';

function getSubscribeInfo() {
    const subscriptionPath = __env.get('clash.path.subscription', '@/')
    const subInfoFile = __join(subscriptionPath, clashConst.SUBSCRIBE_INFO_FILE_NAME);
    if (fs.existsSync(subInfoFile)) {
        return fs.readFileSync(subInfoFile).toString();
    }
    return ''
}

function saveSubscribeInfo(label = 'Unknown', subInfo) {
    if (isBlank(subInfo)) return
    const subscriptionPath = __env.get('clash.path.subscription', '@/')
    const subInfoFile = __join(subscriptionPath, clashConst.SUBSCRIBE_INFO_FILE_NAME);
    if (!fs.existsSync(subscriptionPath)) {
        fs.mkdirSync(subscriptionPath, { recursive: true })
    }
    fs.writeFileSync(subInfoFile, subInfo)
    __log.info(`[Clash Subscribe] Save clash source[${label}] subInfo success.`);
}

async function subscribeSources(from) {
    const subscription = __env.get('clash.subscription', {})
    const sources = Array.from(subscription.sources ?? [])
    if (sources.length === 0) {
        __log.warn('[Clash Subscribe] Subscribe clash sources skipped, cause sources empty.')
        return
    }
    for (const source of sources) {
        const { url, label, isDefault = false } = source
        if (isBlank(label)) {
            continue
        }
        if (isBlank(url)) {
            __log.warn(`[Clash Subscribe] Subscribe clash source[${label}] skipped.`)
            continue
        }
        await getUrlFull(url).then(res => {
            if (isDefault) {
                const subInfo = res.headers['subscription-userinfo']
                saveSubscribeInfo(label, subInfo)
                pushSubscribedInfoNotification(subInfo, from)
            }
            saveSubscription(res.data, label)
        }).catch(ex => error(`[Clash Subscribe] Subscribe clash source[${label}] failed.`, ex))
    }
}

function saveSubscription(data, label) {
    const subscriptionPath = __env.get('clash.path.subscription', '@/')
    const subscribeClashFile = __join(subscriptionPath, label + '.yaml')
    const subscribeClashUpdatetimeFile = __join(subscriptionPath, label + '.datetime')
    if (!fs.existsSync(subscriptionPath)) {
        fs.mkdirSync(subscriptionPath, { recursive: true })
    }
    fs.writeFileSync(subscribeClashFile, data)
    fs.writeFileSync(subscribeClashUpdatetimeFile, new Date().getTime() + '')
    __log.info(`[Clash Subscribe] Subscription[${label}] saved: `, subscribeClashFile)
}

function getSubscriptionSourcesObj() {
    const subscriptionPath = __env.get('clash.path.subscription', '@/')
    const subscription = __env.get('clash.subscription', {})
    const sources = Array.from(subscription.sources ?? [])
    return sources.map(source => {
        const { label } = source
        if (isBlank(label)) {
            return null
        }
        const subscribeClashFile = __join(subscriptionPath, label + '.yaml')
        let obj = null
        try {
            const objStr = fs.readFileSync(subscribeClashFile).toString()
            obj = yaml.parse(objStr)
        } catch (ex) {
            __log.error(`[Clash Subscribe] Parse clash source[${label}] failed.`, ex)
        }
        return obj === null ? null : { label, obj }
    }).filter(o => o !== null)
}

function pushSubscribedInfoNotification(subInfo, from) {    
    let info = subInfo.split('; ')
    const message = { event: 'Clash Subscribe' }
    info.forEach(str => {
        const kv = str.split('=')
        message[kv[0]] = kv[1]
    })
    pushNotification(JSON.stringify(message), from)
}

export {
    getSubscribeInfo,
    getSubscriptionSourcesObj,
    subscribeSources
}