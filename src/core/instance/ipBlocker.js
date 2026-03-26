class IpBlocker {
    static instance = new IpBlocker();

    #cache = new Map();
    #maxCount;
    #maxInterval;
    #blockTime;

    #ready = false;

    constructor() {
    }

    static start() {
        if (!IpBlocker.instance.ready()) {
            const blockerConfig = __env.get('api.ipBlocker', { enable: false })
            if (blockerConfig.enable) {
                const blockTime = __env.getEvaluate('api.ipBlocker.blockTime', 1000 * 60 * 6 * 24);
                const maxInterval = __env.getEvaluate('api.ipBlocker.maxInterval', 1000 * 60);
                IpBlocker.instance.initialize(blockerConfig.maxCount, maxInterval, blockTime)
            }
        }
    }

    ready() {
        return this.#ready;
    }

    initialize(maxCount = 100, maxInterval = 60000, blockTime = 1000 * 60 * 60 * 24) {
        this.#maxCount = maxCount;
        this.#maxInterval = maxInterval;
        this.#blockTime = blockTime;
        this.#ready = true;
        __log.info("[IP Blocker] Enabled.");
    }

    checkIp(realIp) {
        if (!this.#ready) return true;
        let result = true;
        if (typeof realIp === 'string' && !realIp.includes("Unknown")) {
            let obj = null
            if (this.#cache.has(realIp)) {
                obj = this.#cache.get(realIp);
                const now = new Date().getTime();
                if (obj.blocked) return false;
                if (now - obj.timestamp < this.#maxInterval && obj.count >= this.#maxCount) {
                    obj.blocked = true;
                    result = false;
                } else if (now - obj.timestamp > this.#maxInterval) {
                    obj.count = 0;
                }
                obj.count++;
                obj.timestamp = now;
            } else obj = { count: 1, timestamp: new Date().getTime(), blocked: false };
            this.#cache.set(realIp, obj);
        }
        return result;
    }

    clean() {
        if (!this.#ready) return;
        const now = new Date().getTime();
        for (const [realIp, obj] of this.#cache) {
            if (obj.blocked && now - obj.timestamp > this.#blockTime) {
                this.#cache.delete(realIp)
            } else if (!obj.blocked && now - obj.timestamp > this.#maxInterval) {
                this.#cache.delete(realIp)
            }
        }
    }

    destroy() {
        if (!this.#ready) return;
        this.#cache = null;
        this.#ready = false;
        __log.info("[IP Blocker] Destroy.")
    }

    unblock(realIp) {
        if (this.#ready && this.#cache.has(realIp)) {
            this.#cache.delete(realIp);
        }
    }
}

export const ipBlocker = {
    start: () => (IpBlocker.instance.destroy(), IpBlocker.start()),
    clean: () => IpBlocker.instance.clean(),
    ready: () => IpBlocker.instance.ready(),
    check: (realIp, connectType = 'http') => IpBlocker.instance.checkIp(`${connectType}::` + realIp),
    unblock: (realIp, connectType = 'http') => IpBlocker.instance.unblock(`${connectType}::` + realIp)
}