import { TokenBucket } from "../instance/tokenBucket.js";

let tokenBucket = null;

const destroy = (initSize) => {
    let init = initSize;
    if (tokenBucket !== null) {
        init = tokenBucket.destroy();
        tokenBucket = null;
    }
    return init;
}

export function startTokenBucket() {
    const tokenBucketConfig = __env.get('api.tokenBucket.config', { enable: false });
    if (!tokenBucketConfig.enable) {
        destroy();
    } else {
        let initSize = destroy(tokenBucketConfig.initSize);
        tokenBucket = new TokenBucket(initSize, tokenBucketConfig.maxSize, tokenBucketConfig.rate);
    }
}

export function isBucketDestroyed() {
    return tokenBucket === null;
}

export function getToken() {
    return tokenBucket === null || tokenBucket.getToken();
}

export function getNeedTokenApi() {
    return __env.get('api.tokenBucket.needToken', []);
}