import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as YAML from "yaml";
import { mergeObject, getItem } from "../common/objectUtil.js";

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
    constructor(resourcePath, applicationType = defaultApplicationType) {
        this.#resourcePath = resourcePath;
        this.#type = String(applicationType).toLocaleLowerCase();
        this.#parser = parserHandler[this.#type] ?? JSON;
    }

    #initialize(ignoreActives = []) {
        const suffix = this.#type;
        const configFile = join(this.#resourcePath, `application.${suffix}`);
        if (!existsSync(configFile)) {
            throw new Error(`File not exists: application.${suffix}.`);
        }
        this.#context = this.#parser.parse(readFileSync(configFile).toString());
        logger(`[Configuration] Loaded configuration: application.${suffix}.`);
        const actives = getActives(this.#context, ignoreActives)
        if (actives.length > 0) {
            logger(`[Configuration] Configuration actives: ${actives.join(',')}`)
            actives.forEach(active => {
                const activeFile = join(
                    this.#resourcePath,
                    `application-${active}.${suffix}`
                );
                if (!existsSync(activeFile)) {
                    throw new Error(
                        `Active File not exists: application-${active}.${suffix}.`
                    );
                }
                const activeJson = this.#parser.parse(
                    readFileSync(activeFile).toString()
                );
                mergeObject(this.#context, activeJson);
                logger(
                    `[Configuration] Loaded configuration: application-${active}.${suffix}.`
                );
            })
        }
        return JSON.parse(JSON.stringify(this.#context));
    }

    load(ignoreActives) {
        return this.#initialize(ignoreActives);
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
            logger(
                `[Configuration] Merged configuration: ${label}.`
            );
        }
        return JSON.parse(JSON.stringify(this.#context));
    }
}

function getActives(context, ignoreActives = []) {
    const result = [];
    const args = __args;
    let activeStr = "";
    if (args.hasOwnProperty("active") && isNotBlank(args.active)) {
        activeStr = String(args.active).trim();
    } else {
        try {
            const active = getItem(context, "profiles.active");
            if (isNotBlank(active)) {
                activeStr = String(active).trim();
            }
        } catch (error) { }
    }
    activeStr.length > 0 && result.push(...activeStr.split(",").map((s) => s.trim()));
    return result.filter(r => !ignoreActives.includes(r));
}
