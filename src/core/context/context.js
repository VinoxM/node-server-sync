import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as YAML from "yaml";
import { getItem, tryClone, mergeObject } from "#utils/objectUtil.js";
import { ContextSubscribe } from "./subscribe.js";
import { LRUCache } from "../infra/extendMap.js";
import { Tracer } from "../infra/tracer.js";

const defaultApplicationType = "yaml";
const parserHandler = {
    yaml: YAML,
    json: JSON,
};

/**
 * 应用程序基础配置上下文管理器
 * 负责解析 application.yaml 及对应 active profiles 的配置，提供带 LRU 缓存的配置项读取与热更新通知
 */
export class ApplicationContext {
    /** @type {string} 资源目录绝对路径 */
    #resourcePath;

    /** @type {{ parse: (str: string) => any }} 配置文件内容解析器 */
    #parser;

    /** @type {Record<string, any>} 内存中合并后的完整配置对象树 */
    #context;

    /** @type {string} 配置文件格式类型 (如 'yaml' 或 'json') */
    #type;

    /** @type {Map<number, ContextSubscribe>} 已注册的配置更新订阅者 Map (key 为自增 subscribeId) */
    #subscribed = new Map();

    /** @type {number} 订阅者分配自增 ID 计数器 */
    #subscribeId = 1;

    /** @type {LRUCache} 属性路径查询结果 LRU 缓存 (容量 100) */
    #propertyCache = new LRUCache(100);

    /** @type {string[]} 当前激活的 profiles 列表 (如 ['main', 'sqlite', 'dev']) */
    #actives = [];

    /**
     * @param {string} resourcePath - 配置资源所在文件夹绝对路径
     * @param {string} [applicationType='yaml'] - 配置文件类型格式 ('yaml' 或 'json')
     */
    constructor(resourcePath, applicationType = defaultApplicationType) {
        this.#resourcePath = resourcePath;
        this.#type = String(applicationType).toLocaleLowerCase();
        this.#parser = parserHandler[this.#type] ?? JSON;
    }

    /**
     * 读取并合并 application.* 与所有 active profiles 配置
     * @returns {Record<string, any>} 解析后的配置副本
     */
    #initialize() {
        const placeholder = this.logPlaceholder();
        const suffix = this.#type;
        const configFile = join(this.#resourcePath, `application.${suffix}`);
        if (!existsSync(configFile)) {
            throw new Error(`File not exists: application.${suffix}.`);
        }
        this.#context = this.#parser.parse(readFileSync(configFile).toString());
        Tracer.runClearly(() => __log.info(`[${placeholder}] Loaded configuration: application.${suffix}.`));
        this.#actives = getActives(this.#context);
        if (this.#actives.length > 0) {
            Tracer.runClearly(() => __log.info(`[${placeholder}] Configuration actives: ${this.#actives.join(',')}`));
            this.#actives.forEach(active => {
                const activeFile = join(this.#resourcePath, `application-${active}.${suffix}`);
                if (!existsSync(activeFile)) {
                    throw new Error(`Active File not exists: application-${active}.${suffix}.`);
                }
                const activeJson = this.#parser.parse(readFileSync(activeFile).toString());
                mergeObject(this.#context, activeJson);
                Tracer.runClearly(() => __log.info(`[${placeholder}] Loaded configuration: application-${active}.${suffix}.`));
            });
        }
        return tryClone(this.#context);
    }

    /**
     * 获取日志输出的前缀占位符
     * @returns {string}
     */
    logPlaceholder() {
        return 'Configuration';
    }

    /**
     * 异步加载/重新加载全部配置文件
     * @returns {Promise<Record<string, any>>}
     */
    async load() {
        const context = this.#initialize();
        return Promise.resolve(context);
    }

    /**
     * 获取当前完整配置对象树的深拷贝快照
     * @returns {Record<string, any>}
     */
    getSnapshot() {
        return tryClone(this.#context);
    }

    /**
     * 根据点分路径 (如 'server.port') 读取配置项（具备 LRU 高速缓存）
     * @template T
     * @param {string} key - 点分路径键名
     * @param {T} [defaultValue] - 默认回退值
     * @returns {T} 配置项的值（深拷贝副本）
     */
    getProperty(key, defaultValue) {
        if (this.#propertyCache.has(key)) {
            return this.#propertyCache.get(key);
        }
        const result = getItem(this.#context, key, defaultValue);
        this.#propertyCache.set(key, result);
        return tryClone(result);
    }

    /**
     * 动态合并外部配置对象至当前配置树中（合并后自动清空属性查询缓存）
     * @param {Record<string, any>} obj - 待合并的配置对象
     * @param {string} [label='Unknown'] - 配置来源标识（用于日志）
     */
    mergeContext(obj, label = 'Unknown') {
        if (obj && !Array.isArray(obj) && typeof obj === 'object') {
            mergeObject(this.#context, obj);
            this.#propertyCache.clear();
            __log.info(`[${this.logPlaceholder()}] Merged configuration: ${label}.`);
        }
    }

    /**
     * 注册配置更新监听订阅者
     * @param {ContextSubscribe} subscribe - 订阅者实例
     */
    addListen(subscribe) {
        if (subscribe && subscribe instanceof ContextSubscribe && subscribe.setupSubscribeId(this.#subscribeId)) {
            this.#subscribed.set(this.#subscribeId, subscribe);
            this.#subscribeId++;
            Tracer.runClearly(() => __log.debug(`[${this.logPlaceholder()}] Subscribed: ${subscribe.getLabel()}.`));
        }
    }

    /**
     * 注销配置更新监听订阅者
     * @param {ContextSubscribe} subscribe - 订阅者实例
     */
    removeListen(subscribe) {
        if (subscribe && subscribe instanceof ContextSubscribe) {
            const subscribeId = subscribe.getSubscribeId();
            if (this.#subscribed.delete(subscribeId)) {
                Tracer.runClearly(() => __log.debug(`[${this.logPlaceholder()}] Unsubscribed: ${subscribe.getLabel()}.`));
            }
        }
    }

    /**
     * 刷新上下文，清空属性缓存并触发所有已注册订阅者的 `onRefresh` 回调
     */
    refreshContext() {
        this.#propertyCache.clear();
        const subscribes = this.#subscribed.values();
        for (const sub of subscribes) {
            sub && sub instanceof ContextSubscribe && sub.onRefresh();
        }
    }

    /**
     * 判断某个 profile 是否被激活
     * @param {string} label - profile 名称 (如 'dev')
     * @returns {boolean} 是否处于激活状态
     */
    isActive(label) {
        return __isNotBlank(label) && this.#actives.includes(label);
    }
}

/**
 * 解析并提取当前激活的 profiles 列表（综合配置文件与命令行 `--active` 启动参数）
 * @param {Record<string, any>} context - 基础配置文件对象
 * @returns {string[]} 激活的 profile 名称数组
 */
function getActives(context) {
    const result = new Set();
    const args = __args;
    const active = getItem(context, "profiles.active", null);
    if (__isNotBlank(active)) {
        const activeStr = String(active).trim();
        activeStr.length > 0 && activeStr.split(',').forEach(s => s.trim().length > 0 && result.add(s.trim()));
    }
    if (args.hasOwnProperty("active") && __isNotBlank(args.active)) {
        const activeStr = String(args.active).trim();
        activeStr.length > 0 && activeStr.split(',').forEach(s => s.trim().length > 0 && result.add(s.trim()));
    }
    return Array.from(result);
}
