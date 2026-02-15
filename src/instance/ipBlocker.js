export class IpBlocker {
    #cache = new Map();
    #maxCount;
    #maxInterval;
    #blockTime;

    constructor(maxCount = 100, maxInterval = 60000, blockTime = 1000 * 60 * 60 * 24) {
        this.#maxCount = maxCount;
        this.#maxInterval = maxInterval;
        this.#blockTime = blockTime;
        __log.info("[IP Blocker] Enabled.");
    }

    checkIp(realIp) {
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
        this.#cache = null;
        __log.info("[IP Blocker] Destroy.")
    }

    unblock(realIp) {
        if (this.#cache.has(realIp)) {
            this.#cache.delete(realIp);
        }
    }
}