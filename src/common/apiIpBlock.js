import { IpBlocker } from "../instance/ipBlocker.js";

let ipBlocker = null;

function destroyBlocker() {
    if (ipBlocker !== null) {
        ipBlocker.destroy();
        ipBlocker = null;
    }
}

export function startIpBlocker() {
    const blockerConfig = __env.get('api.ipBlocker', {
        enable: false,
        maxInterval: [1000, 60],
        maxCount: 100,
        blockTime: [1000, 60, 60, 24]
    })
    destroyBlocker();
    if (blockerConfig.enable) {
        const blockTime = Array.isArray(blockerConfig.blockTime) ? blockerConfig.blockTime.reduce((a, b) => a * b) : blockerConfig.blockTime;
        const maxInterval = Array.isArray(blockerConfig.maxInterval) ? blockerConfig.maxInterval.reduce((a, b) => a * b) : blockerConfig.maxInterval;
        ipBlocker = new IpBlocker(blockerConfig.maxCount, maxInterval, blockTime);
    }
}

export function cleanBlocker() {
    if (ipBlocker !== null) {
        ipBlocker.clean();
    }
}

export function isIpBlockerDestroyed() {
    return ipBlocker === null;
}

export function checkIp(realIp, connectType = 'http') {
    if (ipBlocker === null) return true;
    else {
        return ipBlocker.checkIp(`${connectType}::` + realIp);
    }
}

export function getBlockIgnore() {
    return __env.get('api.ipBlocker.blockIgnore', []);
}

export function unblockIp(realIp) {
    if (ipBlocker !== null) {
        ipBlocker.unblock(realIp);
    }
}