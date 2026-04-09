import { join as pathJoin } from "path";
import { initializeDB, getSqliteDB, getRedisClient } from "./core/database/index.js";
import { initializeLogger, setupGlobalLogFunc, setupLoggerLevel } from "./core/logger/index.js";
import { createContext } from "./core/context/index.js";
import { evaluate } from 'mathjs';

const globalUtils = {
    __notNull: obj => obj !== undefined && obj !== null,
    __isBlank: (str) => {
        return str === null || str === undefined || ("" + str).trim() === "";
    },
    __isAllBlank: (...args) => {
        return args.every(str => globalUtils.__isBlank(str))
    },
    __isAnyBlank: (...args) => {
        return args.some(str => globalUtils.__isBlank(str))
    },
    __isBlankOr: (str, elseStr) => {
        if (str === null || str === undefined || ("" + str).trim() === "") {
            return elseStr;
        }
        return str;
    },
    __isNotBlank: (str) => {
        return str !== null && str !== undefined && ("" + str).trim() !== "";
    },
    __isNotEmptyArray: (arr) => {
        return arr !== null && arr !== undefined && Array.isArray(arr) && arr.length > 0;
    },
    __isEmptyArray: (arr) => {
        return arr === null || arr === undefined || !Array.isArray(arr) || arr.length === 0;
    },
    __throwError: (reason) => {
        throw new Error(reason);
    },
    __throwMessage: (message, code = -1, status = 200) => {
        throw { msg: message, code, status };
    },
    __isFunction: func => func && typeof func === 'function',
    __isPromise: obj => obj && obj instanceof Promise,
    __isError: ex => ex instanceof Error
}

function getProcessArgs() {
    const result = {};
    const argv = process.argv;
    argv.forEach(arg => {
        if (arg.startsWith("--")) {
            const kv = arg.replace("--", '').split("=");
            result[kv[0]] = kv[1] || null;
        }
    })
    return result;
}

let applicationContext = null;

export async function setupGlobal(rootPath) {
    if (applicationContext !== null) return

    globalThis.__dirname = rootPath

    // console logger with date time
    Object.assign(globalThis, globalUtils)

    // replace '@' to root path
    globalThis.__join = (...args) => {
        if (!args) return "";
        if (args[0].startsWith("@")) {
            args[0] = args[0].replace("@", rootPath);
        }
        return pathJoin(...args);
    }

    applicationContext = createContext(pathJoin(rootPath, 'resource'), 'yaml')

    // load process arguments
    globalThis.__args = getProcessArgs()

    setupGlobalLogFunc()

    // load environment
    await reloadApplicationContext()
    globalThis.__env = {
        get: (key, defaultValue) => applicationContext.getProperty(key, defaultValue),
        getEvaluate: (key, defaultValue) => {
            const value = applicationContext.getProperty(key, defaultValue)
            try {
                return evaluate(value)
            } catch (err) {
                __log.error(`[Environment] Get '${key}' evaluate failed: '${value}'. `
                    + `Use default value: ${defaultValue}`, err?.message ?? err)
                return defaultValue
            }
        },
        subscribe: (sub) => applicationContext.addListen(sub),
        unsubscribe: (sub) => applicationContext.removeListen(sub),
        isDev: () => applicationContext.isActive?.('dev')
    }

    initializeLogger(__env.get('logger.savePath'))

    // load database
    await initializeDB();
    globalThis.__sqliteDB = getSqliteDB();
    globalThis.__redisClient = getRedisClient();
}

export async function reloadApplicationContext() {
    const config = await applicationContext.load()
    setupLoggerLevel(config?.logger?.level)
    applicationContext.refreshContext()
}