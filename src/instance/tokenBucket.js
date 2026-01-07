export class TokenBucket {
    // 剩余令牌数.
    #token;
    // 令牌桶容量.
    #maxSize;
    // 生成速率,每秒生成的令牌个数.
    #rate;
    // 上次获取令牌的时间戳.
    #lastTakeTime = null;

    constructor(initSize, maxSize, rate) {
        this.#token = initSize > 0 ? initSize : 10;
        this.#maxSize = maxSize > 0 ? maxSize : 100;
        this.#rate = rate > 0 ? rate : 1;
        this.#lastTakeTime = this.#getNow();
        logger("[Token Bucket] Enabled.");
    }

    #getNow() {
        return Math.floor(new Date().getTime() / 1000);
    }

    getToken(requested = 1) {
        // 获取剩余令牌数.
        // 当前时间.
        const now = this.#getNow();
        // 距离上次获取令牌共生成的令牌数.
        const createCount = (now - this.#lastTakeTime) * this.#rate;
        // 保存获取时间.
        this.#lastTakeTime = now;
        // 剩余令牌.
        this.#token = Math.min(this.#maxSize, this.#token + createCount);
        // 剩余令牌是否足够.
        if (this.#token >= requested) {
            this.#token -= requested;
            return true;
        }
        return false;
    }

    destroy() {
        logger("[Token Bucket] Destroy.");
        return this.#token;
    }
}