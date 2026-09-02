/**
 * IP 限流与恶意请求自动封禁拦截器 (单例模式)
 * 基于滑动窗口时间段内的请求频次自动判定异常并封锁 IP
 */
class IpBlocker {
    /** @type {IpBlocker} 单例实例 */
    static instance = new IpBlocker();

    /** @type {Map<string, { count: number, timestamp: number, blocked: boolean }>} IP 访问统计与封禁状态缓存字典 */
    #cache = new Map();

    /** @type {number} 时间窗口内允许的最大访问次数上限 */
    #maxCount;

    /** @type {number} 频次统计时间窗口大小 (毫秒) */
    #maxInterval;

    /** @type {number} 触发封禁后的封锁持续时间 (毫秒) */
    #blockTime;

    /** @type {boolean} 是否已就绪开启 */
    #ready = false;

    constructor() {
    }

    /**
     * 读取配置并启动 IP 拦截器
     */
    static start() {
        if (!IpBlocker.instance.ready()) {
            const blockerConfig = __env.get('api.ipBlocker', { enable: false });
            if (blockerConfig.enable) {
                const blockTime = __env.getEvaluate('api.ipBlocker.blockTime', 1000 * 60 * 6 * 24);
                const maxInterval = __env.getEvaluate('api.ipBlocker.maxInterval', 1000 * 60);
                IpBlocker.instance.initialize(blockerConfig.maxCount, maxInterval, blockTime);
            }
        }
    }

    /**
     * 获取拦截器是否已就绪启用
     * @returns {boolean}
     */
    ready() {
        return this.#ready;
    }

    /**
     * 初始化参数并启用拦截器
     * @param {number} [maxCount=100] - 窗口内最大请求次数
     * @param {number} [maxInterval=60000] - 统计窗口毫秒数
     * @param {number} [blockTime=86400000] - 封禁时长毫秒数
     */
    initialize(maxCount = 100, maxInterval = 60000, blockTime = 1000 * 60 * 60 * 24) {
        this.#maxCount = maxCount;
        this.#maxInterval = maxInterval;
        this.#blockTime = blockTime;
        this.#ready = true;
        __log.info("[IP Blocker] Enabled.");
    }

    /**
     * 检查并累计指定 IP 的访问次数，返回是否允许通行
     * @param {string} realIp - 客户端 IP（或带协议前缀标识）
     * @returns {boolean} true 表示正常允许访问，false 表示已被封禁
     */
    checkIp(realIp) {
        if (!this.#ready) return true;
        let result = true;
        if (typeof realIp === 'string' && !realIp.includes("Unknown")) {
            let obj = null;
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

    /**
     * 清理已过期的正常访问记录与封禁期已满的 IP
     */
    clean() {
        if (!this.#ready) return;
        const now = new Date().getTime();
        for (const [realIp, obj] of this.#cache) {
            if (obj.blocked && now - obj.timestamp > this.#blockTime) {
                this.#cache.delete(realIp);
            } else if (!obj.blocked && now - obj.timestamp > this.#maxInterval) {
                this.#cache.delete(realIp);
            }
        }
    }

    /**
     * 销毁并清空拦截器缓存
     */
    destroy() {
        if (!this.#ready) return;
        this.#cache = null;
        this.#ready = false;
        __log.info("[IP Blocker] Destroy.");
    }

    /**
     * 手动解除指定 IP 的封禁状态
     * @param {string} realIp - 客户端 IP
     */
    unblock(realIp) {
        if (this.#ready && this.#cache.has(realIp)) {
            this.#cache.delete(realIp);
        }
    }
}

/** IP 拦截器快捷单例入口 */
export const ipBlocker = {
    /** 启动/重载 IP 拦截器 */
    start: () => (IpBlocker.instance.destroy(), IpBlocker.start()),
    /** 定期清理过期条目 */
    clean: () => IpBlocker.instance.clean(),
    /** 获取启用状态 */
    ready: () => IpBlocker.instance.ready(),
    /** 检查 IP 是否放行 */
    check: (realIp, connectType = 'http') => IpBlocker.instance.checkIp(`${connectType}::` + realIp),
    /** 解除 IP 封禁 */
    unblock: (realIp, connectType = 'http') => IpBlocker.instance.unblock(`${connectType}::` + realIp)
};