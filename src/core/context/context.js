import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as YAML from "yaml";
import { getItem, tryClone, mergeObject } from "../../common/utils/objectUtil.js";
import { ContextSubscribe } from "./subscribe.js";
import { LRUCache } from "../infra/extendMap.js";
import { Tracer } from "../infra/tracer.js";

const defaultApplicationType = "yaml";
const parserHandler = {
    yaml: YAML,
    json: JSON,
};

export class ApplicationContext {
    #resourcePath;
    #parser;
    #context;
    #type;

    #subscribed = new Map()
    #subscribeId = 1

    #propertyCache = new LRUCache(100)

    #actives = []

    constructor(resourcePath, applicationType = defaultApplicationType) {
        this.#resourcePath = resourcePath;
        this.#type = String(applicationType).toLocaleLowerCase();
        this.#parser = parserHandler[this.#type] ?? JSON;
    }

    #initialize() {
        const placeholder = this.logPlaceholder()
        const suffix = this.#type;
        const configFile = join(this.#resourcePath, `application.${suffix}`);
        if (!existsSync(configFile)) {
            throw new Error(`File not exists: application.${suffix}.`);
        }
        this.#context = this.#parser.parse(readFileSync(configFile).toString());
        Tracer.runClearly(() => __log.info(`[${placeholder}] Loaded configuration: application.${suffix}.`));
        this.#actives = getActives(this.#context)
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
            })
        }
        return tryClone(this.#context);
    }

    logPlaceholder() {
        return 'Configuration'
    }

    async load() {
        const context = this.#initialize()
        return Promise.resolve(context);
    }

    getSnapshot() {
        return tryClone(this.#context);
    }

    getProperty(key, defaultValue) {
        if (this.#propertyCache.has(key)) {
            return this.#propertyCache.get(key)
        }
        const result = getItem(this.#context, key, defaultValue);
        this.#propertyCache.set(key, result);
        return tryClone(result);
    }

    mergeContext(obj, label = 'Unknown') {
        if (obj && !Array.isArray(obj) && typeof obj === 'object') {
            mergeObject(this.#context, obj);
            this.#propertyCache.clear();
            __log.info(`[${this.logPlaceholder()}] Merged configuration: ${label}.`);
        }
    }

    addListen(subscribe) {
        if (subscribe && subscribe instanceof ContextSubscribe && subscribe.setupSubscribeId(this.#subscribeId)) {
            this.#subscribed.set(this.#subscribeId, subscribe)
            this.#subscribeId++
            Tracer.runClearly(() => __log.debug(`[${this.logPlaceholder()}] Subscribed: ${subscribe.getLabel()}.`))
        }
    }

    removeListen(subscribe) {
        if (subscribe && subscribe instanceof ContextSubscribe) {
            const subscribeId = subscribe.getSubscribeId()
            if (this.#subscribed.delete(subscribeId)) {
                Tracer.runClearly(() => __log.debug(`[${this.logPlaceholder()}] Unsubscribed: ${subscribe.getLabel()}.`))
            }
        }
    }

    refreshContext() {
        this.#propertyCache.clear()
        const subscribes = this.#subscribed.values()
        for (const sub of subscribes) {
            sub && sub instanceof ContextSubscribe && sub.onRefresh()
        }
    }

    isActive(label) {
        return __isNotBlank(label) && this.#actives.includes(label)
    }
}

function getActives(context) {
    const result = [];
    const args = __args;
    let activeStr = "";
    if (args.hasOwnProperty("active") && __isNotBlank(args.active)) {
        activeStr = String(args.active).trim();
    } else {
        const active = getItem(context, "profiles.active", null);
        if (__isNotBlank(active)) {
            activeStr = String(active).trim();
        }
    }
    activeStr.length > 0 && result.push(...activeStr.split(",").map((s) => s.trim()));
    return result;
}
