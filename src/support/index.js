import { join as pathJoin } from "path";
import { ApplicationContext } from "./context.js";
import { initializeDB, getSqliteDB, getRedisClient } from "../database/index.js";
import { initializeLogger, setupGlobalLogFunc, setupLoggerLevel } from "./logger.js";

const globalUtils = {
    isBlank: (str) => {
        return str === null || str === undefined || ("" + str).trim() === "";
    },
    isAnyBlank: (...strs) => {
        return Array.from(strs).some(str => globalUtils.isBlank(str))
    },
    isBlankOr: (str, elseStr) => {
        if (str === null || str === undefined || ("" + str).trim() === "") {
            return elseStr;
        }
        return str;
    },
    isNotBlank: (str) => {
        return str !== null && str !== undefined && ("" + str).trim() !== "";
    },
    isNotEmptyArray: (arr) => {
        return arr !== null && arr !== undefined && Array.isArray(arr) && arr.length > 0;
    },
    isEmptyArray: (arr) => {
        return arr === null || arr === undefined || !Array.isArray(arr) || arr.length === 0;
    },
    throwError: (reason) => {
        throw new Error(reason);
    },
    throwMessage: (message, code = -1, status = 200) => {
        throw { msg: message, code, status };
    },
    isFunction: func => func && typeof func === 'function',
    isPromise: obj => obj && obj instanceof Promise,
    isError: ex => ex instanceof Error,
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

    applicationContext = new ApplicationContext(pathJoin(rootPath, 'resource'), 'yaml')

    // load process arguments
    globalThis.__args = getProcessArgs()

    globalThis.__dirname = rootPath

    // console logger with date time
    Object.assign(globalThis, globalUtils)

    // replace '@' to root path
    globalThis.join = (...args) => {
        if (!args) return "";
        if (args[0].startsWith("@")) {
            args[0] = args[0].replace("@", rootPath);
        }
        return pathJoin(...args);
    }

    setupGlobalLogFunc()

    // load environment
    reloadApplicationContext()
    globalThis.__env = {
        get: (key, defaultValue) => applicationContext.getProperty(key, defaultValue)
    }

    initializeLogger(__env.get('logger.savePath'))

    // load database
    await initializeDB();
    globalThis.sqliteDB = getSqliteDB();
    globalThis.redisClient = getRedisClient();
}

export function reloadApplicationContext() {
    const config = applicationContext.load()
    setupLoggerLevel(config?.logger?.level)
}