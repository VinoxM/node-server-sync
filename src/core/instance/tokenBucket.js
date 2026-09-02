/**
 * 令牌桶限流算法实现类 (单例模式)
 * 用于全局 API 请求速率限制
 */
class TokenBucket {
    /** @type {TokenBucket} 单例实例 */
    static instance = new TokenBucket();

    /** @type {number} 当前桶内剩余令牌数 */
    #token = 0;

    /** @type {number} 令牌桶最大容量上限 */
    #maxSize;

    /** @type {number} 令牌生成速率 (每秒生成个数) */
    #rate;

    /** @type {number|null} 上次获取/补充令牌的时间戳 (秒) */
    #lastTakeTime = null;

    /** @type {boolean} 是否已就绪开启 */
    #ready = false;

    constructor() {
    }

    /**
     * 读取配置并启动令牌桶
     */
    static start() {
        const instance = TokenBucket.instance;
        const initSize = instance.destroy();
        const tokenBucketConfig = __env.get('api.tokenBucket.config', { enable: false });
        if (tokenBucketConfig.enable) {
            instance.initialize(initSize, tokenBucketConfig.maxSize, tokenBucketConfig.rate);
        }
    }

    /**
     * 获取是否就绪可用
     * @returns {boolean}
     */
    ready() {
        return this.#ready;
    }

    /**
     * 初始化令牌桶参数
     * @param {number} initSize - 初始令牌数
     * @param {number} maxSize - 桶最大容量
     * @param {number} rate - 每秒新增速率
     */
    initialize(initSize, maxSize, rate) {
        this.#token = initSize > 0 ? initSize : 10;
        this.#maxSize = maxSize > 0 ? maxSize : 100;
        this.#rate = rate > 0 ? rate : 1;
        this.#lastTakeTime = this.#getNow();
        this.#ready = true;
        __log.info("[Token Bucket] Enabled.");
    }

    /**
     * 获取当前时间戳 (秒)
     * @returns {number}
     */
    #getNow() {
        return Math.floor(Date.now() / 1000);
    }

    /**
     * 尝试从桶中获取指定数量的令牌
     * @param {number} [requested=1] - 申请的令牌数量
     * @returns {boolean} 获取成功返回 true，令牌不足返回 false
     */
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

    /**
     * 销毁并停用令牌桶，返回当前剩余令牌数量
     * @returns {number}
     */
    destroy() {
        if (this.#ready) {
            this.#ready = false;
            __log.info("[Token Bucket] Destroy.");
        }
        return this.#token;
    }
}

/** 令牌桶快捷单例操作入口 */
export const tokenBucket = {
    /** 启动或重载令牌桶 */
    start: () => TokenBucket.start(),
    /** 销毁令牌桶 */
    destroy: () => TokenBucket.instance.destroy(),
    /** 检查启用状态 */
    ready: () => TokenBucket.instance.ready(),
    /** 
     * 申请令牌
     * @param {number} [requested=1] - 要申请的令牌数量
     * @returns {boolean} 是否申请成功
     */
    getToken: requested => TokenBucket.instance.getToken(requested)
};