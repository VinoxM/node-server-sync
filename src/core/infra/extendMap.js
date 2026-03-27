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

export class HybridLRUCache {
    #limit;
    #values;
    #ttlArr;
    #keyToIndex = new Map();
    #emptySlots = [];
    #cursor = 0;

    constructor(limit = 100) {
        this.#limit = limit;
        this.#values = new Array(limit);
        this.#ttlArr = new BigInt64Array(limit);
    }

    has(key) {
        return this.#get(key) !== undefined;
    }

    set(key, value, ttl = 0) {
        let index;

        if (this.#keyToIndex.has(key)) {
            index = this.#keyToIndex.get(key);
            this.#keyToIndex.delete(key);
        } else {
            if (this.#keyToIndex.size >= this.#limit) {
                const firstKey = this.#keyToIndex.keys().next().value;
                const oldIndex = this.#keyToIndex.get(firstKey);
                this.#keyToIndex.delete(firstKey);
                this.#emptySlots.push(oldIndex);
            }
            index = this.#emptySlots.length > 0 ? this.#emptySlots.pop() : this.#cursor++;
        }
        this.#keyToIndex.set(key, index);
        this.#values[index] = value;
        this.#ttlArr[index] = ttl > 0 ? BigInt(Date.now() + ttl) : 0n;

        return this;
    }

    #get(key, sort = false) {
        const index = this.#keyToIndex.get(key);
        if (index === undefined) return undefined;
        if (this.#ttlArr[index] > 0n && BigInt(Date.now()) > this.#ttlArr[index]) {
            this.delete(key);
            return undefined;
        }
        const val = this.#values[index];
        if (sort) {
            this.#keyToIndex.delete(key);
            this.#keyToIndex.set(key, index);
        }
        return val;
    }

    get(key) {
        return this.#get(key, true)
    }

    delete(key) {
        const index = this.#keyToIndex.get(key);
        if (index !== undefined) {
            this.#keyToIndex.delete(key);
            this.#values[index] = undefined;
            this.#ttlArr[index] = 0n;
            this.#emptySlots.push(index);
            return true;
        }
        return false;
    }
}