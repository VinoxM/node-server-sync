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
        enable: false
    })
    destroyBlocker();
    if (blockerConfig.enable) {
        const blockTime = __env.getEvaluate('api.ipBlocker.blockTime', 1000 * 60 * 6 * 24);
        const maxInterval = __env.getEvaluate('api.ipBlocker.maxInterval', 1000 * 60);
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