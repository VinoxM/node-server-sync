import { tryClone } from "#utils/objectUtil.js";
import { Tracer } from "#core/infra/tracer.js";

/**
 * 应用配置刷新订阅基类
 * 允许在全局配置发生变更/重新加载时，自动触发注册的回调逻辑
 */
export class ContextSubscribe {
    /** @type {number|null} 注册后分配的唯一订阅 ID */
    #subscribeId = null;

    /** @type {string} 订阅者业务标识名称 */
    #label;

    /** @type {(() => void)|null} 配置刷新时执行的回调函数 */
    #onRefreshCallback = null;

    /**
     * @param {string} [label='Unknown'] - 订阅者标识名称
     * @param {() => void} [onRefresh] - 配置刷新触发的回调函数
     * @param {boolean} [delaySubscribe=false] - 是否延迟手动订阅（为 true 时需后续自行调用 `.doSubscribe()`）
     */
    constructor(label = 'Unknown', onRefresh, delaySubscribe = false) {
        this.#label = label;
        this.#onRefreshCallback = onRefresh;
        delaySubscribe || this.doSubscribe();
    }

    /**
     * 向全局环境配置管理器 (__env) 发起订阅注册
     */
    doSubscribe() {
        this.#subscribeId !== null || __env.subscribe?.(this);
    }

    /**
     * 设置由 ApplicationContext 分配的订阅 ID（仅允许设置一次）
     * @param {number} subscribeId - 订阅 ID
     * @returns {boolean} 设置成功返回 true，若已存在 ID 则返回 false
     */
    setupSubscribeId(subscribeId) {
        if (this.#subscribeId === null) {
            this.#subscribeId = subscribeId;
            return true;
        }
        return false;
    }

    /**
     * 获取当前订阅者的唯一 ID
     * @returns {number|null}
     */
    getSubscribeId() {
        return this.#subscribeId;
    }

    /**
     * 配置刷新事件通知入口（由 ApplicationContext.refreshContext 统一调用）
     */
    onRefresh() {
        Tracer.runClearly(() => {
            __log.debug(`[ContextSubscribe:${this.getLabel()}] Emit onRefresh callback.`);
            this.#onRefreshCallback?.();
        });
    }

    /**
     * 获取订阅者标识名称
     * @returns {string}
     */
    getLabel() {
        return this.#label;
    }

    /**
     * 销毁并注销当前订阅
     */
    destroy() {
        __env.unsubscribe?.(this);
        this.#onRefreshCallback = null;
    }
}

/**
 * 带有值缓存与动态 Getter 自动求值的配置订阅者
 * 当配置刷新时，自动重新调用 getter 计算新值并缓存，支持同步与异步 getter
 */
export class GetterContextSubscribe extends ContextSubscribe {
    /** @type {any} 缓存的计算值 */
    #value = null;

    /** @type {((prevValue: any) => any)|null} 动态求值函数 */
    #getter = null;

    /** @type {boolean} 是否已执行过首次求值与注册 */
    #initialized = false;

    /** @type {number} 异步求值版本轮次序列号（用于防止异步结果乱序覆盖） */
    #currentEpoch = 0;

    /**
     * @param {string} label - 订阅者标识名称
     * @param {(prevValue: any) => any} getter - 取值计算函数（入参为上一次的值，返回值将被缓存）
     */
    constructor(label, getter) {
        super(label, () => { this.#executeGetter(); }, true);
        this.#getter = getter;
    }

    /**
     * 执行 getter 函数并安全更新内部缓存值
     * @returns {Promise<void>}
     */
    async #executeGetter() {
        const epoch = ++this.#currentEpoch;
        const res = this.#getter?.(this.#value);
        if (res instanceof Promise) {
            try {
                const val = await res;
                if (epoch === this.#currentEpoch) {
                    this.#value = val;
                }
            } catch (err) {
                __log.error(`[GetterContextSubscribe:${this.getLabel()}] Async getter failed:`, err);
            }
        } else {
            this.#value = res;
        }
    }

    /**
     * 同步获取当前缓存的配置值（初次调用时会自动触发首次订阅与求值）
     * @template T
     * @returns {T} 缓存值的深拷贝副本
     */
    getValue() {
        if (!this.#initialized) {
            this.doSubscribe();
            this.onRefresh();
            this.#initialized = true;
        }
        return tryClone(this.#value);
    }

    /**
     * 异步获取当前配置值（确保首次调用时异步 getter 也能等待计算完成）
     * @template T
     * @returns {Promise<T>} 缓存值的深拷贝副本
     */
    async getValueAsync() {
        if (!this.#initialized) {
            this.doSubscribe();
            this.#initialized = true;
            await this.#executeGetter();
        }
        return tryClone(this.#value);
    }

    /**
     * 销毁订阅并释放资源
     */
    destroy() {
        super.destroy();
        this.#value = null;
        this.#getter = null;
    }
}