class TokenBucket {
    static instance = new TokenBucket();

    #token = 0;
    #maxSize;
    #rate;
    #lastTakeTime = null;

    #ready = false;

    constructor() {
    }

    static start() {
        const instance = TokenBucket.instance;
        const initSize = instance.destroy();
        const tokenBucketConfig = __env.get('api.tokenBucket.config', { enable: false });
        if (tokenBucketConfig.enable) {
            instance.initialize(initSize, tokenBucketConfig.maxSize, tokenBucketConfig.rate);
        }
    }

    ready() {
        return this.#ready;
    }

    initialize(initSize, maxSize, rate) {
        this.#token = initSize > 0 ? initSize : 10;
        this.#maxSize = maxSize > 0 ? maxSize : 100;
        this.#rate = rate > 0 ? rate : 1;
        this.#lastTakeTime = this.#getNow();
        this.#ready = true;
        __log.info("[Token Bucket] Enabled.");
    }

    #getNow() {
        return Math.floor(Date.now() / 1000);
    }

    getToken(requested = 1) {
        if (!this.ready()) return true;
        const now = this.#getNow();
        const createCount = (now - this.#lastTakeTime) * this.#rate;
        this.#lastTakeTime = now;
        this.#token = Math.min(this.#maxSize, this.#token + createCount);
        if (this.#token >= requested) {
            this.#token -= requested;
            return true;
        }
        return false;
    }

    destroy() {
        if (this.#ready) {
            this.#ready = false;
            __log.info("[Token Bucket] Destroy.");
        }
        return this.#token;
    }
}

export const tokenBucket = {
    start: () => TokenBucket.start(),
    destroy: () => TokenBucket.instance.destroy(),
    ready: () => TokenBucket.instance.ready(),
    getToken: requested => TokenBucket.instance.getToken(requested)
}