import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as YAML from "yaml";
import { mergeObject, getItem, getItemOrElse } from "../common/objectUtil.js";
import { ContextSubcribe } from "./subscribe.js";

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
        __log.info(`[${placeholder}] Loaded configuration: application.${suffix}.`);
        const actives = getActives(this.#context)
        if (actives.length > 0) {
            __log.info(`[${placeholder}] Configuration actives: ${actives.join(',')}`)
            actives.forEach(active => {
                const activeFile = join(this.#resourcePath, `application-${active}.${suffix}`);
                if (!existsSync(activeFile)) {
                    throw new Error(`Active File not exists: application-${active}.${suffix}.`);
                }
                const activeJson = this.#parser.parse(readFileSync(activeFile).toString());
                mergeObject(this.#context, activeJson);
                __log.info(`[${placeholder}] Loaded configuration: application-${active}.${suffix}.`);
            })
        }
        return JSON.parse(JSON.stringify(this.#context));
    }

    logPlaceholder() {
        return 'Configuration'
    }

    async load() {
        const context = this.#initialize()
        return Promise.resolve(context);
    }

    getProperty(key, defaultValue) {
        try {
            return getItem(this.#context, key);
        } catch (error) {
            return defaultValue;
        }
    }

    mergeContext(obj, label = 'Unknown') {
        if (obj && !Array.isArray(obj) && typeof obj === 'object') {
            mergeObject(this.#context, obj);
            __log.info(`[${this.logPlaceholder()}] Merged configuration: ${label}.`);
        }
        return JSON.parse(JSON.stringify(this.#context));
    }

    addListen(subscribe) {
        if (subscribe && subscribe instanceof ContextSubcribe && subscribe.setupSubscribeId(this.#subscribeId)) {
            this.#subscribed.set(this.#subscribeId, subscribe)
            this.#subscribeId++
            __log.debug(`[${this.logPlaceholder()}] Subscribed: ${subscribe.getLabel()}.`)
        }
    }

    removeListen(subscribe) {
        if (subscribe && subscribe instanceof ContextSubcribe) {
            const subscribeId = subscribe.getSubscribeId()
            if (this.#subscribed.delete(subscribeId)) {
                __log.debug(`[${this.logPlaceholder()}] Unsubscribed: ${subscribe.getLabel()}.`)
            }
        }
    }

    refreshContext() {
        const subscribes = this.#subscribed.values()
        for (const sub of subscribes) {
            sub && sub instanceof ContextSubcribe && sub.onRefresh()
        }
    }

}

function getActives(context) {
    const result = [];
    const args = __args;
    let activeStr = "";
    if (args.hasOwnProperty("active") && isNotBlank(args.active)) {
        activeStr = String(args.active).trim();
    } else {
        const active = getItemOrElse(context, "profiles.active", null);
        if (isNotBlank(active)) {
            activeStr = String(active).trim();
        }
    }
    activeStr.length > 0 && result.push(...activeStr.split(",").map((s) => s.trim()));
    return result;
}
