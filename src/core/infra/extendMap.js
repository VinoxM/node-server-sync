/**
 * 基于标准 Map 实现的 LRU 内存缓存（支持 TTL 过期时间与读操作刷新 LRU 顺位选项）
 * @template K, V
 * @extends {Map<K, { v: V, t: number }>}
 */
export class LRUCache extends Map {
    /** @type {number} 最大缓存条目数量上限 */
    #limit;

    /** @type {number} 默认过期 TTL 毫秒数 (0 为永不过期) */
    #ttl;

    /** @type {(key: K) => V|undefined} 根据 onlyWrite 模式绑定的读取函数 */
    #getFunc;

    /**
     * @param {number} [limit=100] - 最大允许缓存的条目数量
     * @param {boolean} [onlyWrite=true] - 是否仅在写入时更新 LRU 顺位（为 true 时读取不调整顺序，提高只读性能）
     * @param {number} [ttl=0] - 默认缓存过期时间（毫秒，0 表示永不过期）
     */
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

    /**
     * 写入键值对并自动淘汰超出上限的最老元素
     * @param {K} key - 缓存键
     * @param {V} value - 缓存值
     * @returns {this}
     */
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

    /**
     * 获取缓存值（已过期则自动清除并返回 undefined）
     * @param {K} key - 缓存键
     * @returns {V|undefined}
     */
    get(key) {
        return this.#getFunc(key);
    }

    /**
     * 检查条目是否已过期
     * @param {{ v: V, t: number }} entry - 内部存储条目
     * @returns {boolean}
     */
    #isExpired(entry) {
        return entry.t > 0 && Date.now() > entry.t;
    }

    /**
     * 仅检查过期并返回值的普通读取（不调整 Map 键序）
     * @param {K} key - 缓存键
     * @returns {V|undefined}
     */
    #getSimple(key) {
        const entry = super.get(key);
        if (!entry) return undefined;

        if (this.#isExpired(entry)) {
            this.delete(key);
            return undefined;
        }
        return entry.v;
    }

    /**
     * 检查过期并在命中后重新置于 Map 尾部的 LRU 读取
     * @param {K} key - 缓存键
     * @returns {V|undefined}
     */
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

/**
 * 基于定长数组与类型化数组 (BigInt64Array) 的高性能紧凑型混合 LRU 缓存
 * @template K, V
 */
export class HybridLRUCache {
    /** @type {number} 最大缓存容量 */
    #limit;

    /** @type {Array<V>} 值存储数组 */
    #values;

    /** @type {BigInt64Array} 过期时间戳 (毫秒) 类型化数组 */
    #ttlArr;

    /** @type {Map<K, number>} 键名到数组槽位索引映射 Map */
    #keyToIndex = new Map();

    /** @type {number[]} 空闲槽位索引回收栈 */
    #emptySlots = [];

    /** @type {number} 当前递增分配游标 */
    #cursor = 0;

    /**
     * @param {number} [limit=100] - 缓存最大条目上限
     */
    constructor(limit = 100) {
        this.#limit = limit;
        this.#values = new Array(limit);
        this.#ttlArr = new BigInt64Array(limit);
    }

    /**
     * 判断指定键是否存在且未过期
     * @param {K} key - 键名
     * @returns {boolean}
     */
    has(key) {
        return this.#get(key) !== undefined;
    }

    /**
     * 写入或更新缓存项
     * @param {K} key - 键名
     * @param {V} value - 缓存值
     * @param {number} [ttl=0] - 当前项的 TTL 毫秒数 (0 为永不过期)
     * @returns {this}
     */
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

    /**
     * 内部读取方法
     * @param {K} key - 键名
     * @param {boolean} [sort=false] - 是否调整 Map 顺序为最新
     * @returns {V|undefined}
     */
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

    /**
     * 读取缓存值并刷新访问顺序
     * @param {K} key - 键名
     * @returns {V|undefined}
     */
    get(key) {
        return this.#get(key, true);
    }

    /**
     * 删除指定缓存项并回收槽位
     * @param {K} key - 键名
     * @returns {boolean} 是否成功删除
     */
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