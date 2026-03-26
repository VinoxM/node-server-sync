export class LRUCache extends Map {
    #limit;
    #ttl;
    #getFunc;

    constructor(limit = 100, onlyWrite = true, ttl = 0) {
        super();
        this.#limit = limit;
        this.#ttl = ttl;

        if (!onlyWrite) {
            this.#getFunc = key => this.#getWithLRU(key);
        } else {
            this.#getFunc = key => this.#getSimple(key);
        }
    }

    set(key, value) {
        if (this.has(key)) {
            this.delete(key);
        }

        const expireAt = this.#ttl > 0 ? Date.now() + this.#ttl : 0;
        super.set(key, { v: value, t: expireAt });

        if (this.size > this.#limit) {
            const firstKey = this.keys().next().value;
            this.delete(firstKey);
        }

        return this;
    }

    get(key) {
        return this.#getFunc(key);
    }

    #isExpired(entry) {
        return entry.t > 0 && Date.now() > entry.t;
    }

    #getSimple(key) {
        const entry = super.get(key);
        if (!entry) return undefined;

        if (this.#isExpired(entry)) {
            this.delete(key);
            return undefined;
        }
        return entry.v;
    }

    #getWithLRU(key) {
        const entry = super.get(key);
        if (!entry) return undefined;

        if (this.#isExpired(entry)) {
            this.delete(key);
            return undefined;
        }

        this.delete(key);
        super.set(key, entry); 
        return entry.v;
    }
}