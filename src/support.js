import { join as pathJoin } from "path";
import { initializeDB, getSqliteDB, getRedisClient } from "#core/database/index.js";
import { destroyLogger, registerLogger, setupLoggerLevel, setupLoggerWorker } from "#core/logger/index.js";
import { createContext } from "#core/context/index.js";
import { evaluate } from 'mathjs';
import { initializeSshScripts } from "#modules/ssh/sshScriptService.js";

/**
 * 全局挂载的基础工具函数集合
 */
const globalUtils = {
    /** 校验对象是否既不是 undefined 也不是 null */
    __notNull: obj => obj !== undefined && obj !== null,

    /** 校验字符串是否为空（null / undefined 或去除首尾空格后为空字符串） */
    __isBlank: (str) => {
        return str === null || str === undefined || ("" + str).trim() === "";
    },

    /** 校验所有参数是否全部为空白 */
    __isAllBlank: (...args) => {
        return args.every(str => globalUtils.__isBlank(str));
    },

    /** 校验参数中是否存在任意一个空白项 */
    __isAnyBlank: (...args) => {
        return args.some(str => globalUtils.__isBlank(str));
    },

    /** 若字符串非空白则返回原值，否则返回备用默认值 */
    __isBlankOr: (str, elseStr) => {
        if (str === null || str === undefined || ("" + str).trim() === "") {
            return elseStr;
        }
        return str;
    },

    /** 校验字符串是否非空（非 null / undefined 且去除空格后不为空） */
    __isNotBlank: (str) => {
        return str !== null && str !== undefined && ("" + str).trim() !== "";
    },

    /** 校验是否为非空数组（非 null/undefined、为数组且长度大于 0） */
    __isNotEmptyArray: (arr) => {
        return arr !== null && arr !== undefined && Array.isArray(arr) && arr.length > 0;
    },

    /** 校验是否为空数组（为 null/undefined、非数组或长度为 0） */
    __isEmptyArray: (arr) => {
        return arr === null || arr === undefined || !Array.isArray(arr) || arr.length === 0;
    },

    /** 抛出标准 Error 异常 */
    __throwError: (reason) => {
        throw new Error(reason);
    },

    /** 抛出包含消息、状态码和 HTTP 状态的结构化业务异常对象 */
    __throwMessage: (message, code = -1, status = 200) => {
        throw { msg: message, code, status };
    },

    /** 校验目标是否为函数 */
    __isFunction: func => func && typeof func === 'function',

    /** 校验目标是否为 Promise 实例 */
    __isPromise: obj => obj && obj instanceof Promise,

    /** 校验目标是否为 Error 实例 */
    __isError: ex => ex instanceof Error
};

/**
 * 解析 process.argv 命令行参数（支持 `--key=value` 与 `--flag` 格式）
 * @returns {ProcessArgs} 冻结的参数键值对对象（附带 `.has(key)` 方法）
 */
function getProcessArgs() {
    const result = {};
    const argv = process.argv;
    argv.forEach(arg => {
        if (arg.startsWith("--")) {
            const str = arg.replace("--", '');
            const equalIndex = str.indexOf('=');
            if (equalIndex !== -1) {
                const key = str.substring(0, equalIndex);
                const value = str.substring(equalIndex + 1);
                result[key] = value || null;
            } else {
                result[str] = null;
            }
        }
    });
    result.has = key => key in result;
    return Object.freeze(result);
}

/** @type {import('./core/context/context.js').ApplicationContext|null} 应用上下文单例 */
let applicationContext = null;

/**
 * 初始化并挂载全局变量与底层服务（仅执行一次）
 * @param {string} rootPath - 应用程序根目录绝对路径
 * @returns {Promise<void>}
 */
async function setupGlobal(rootPath) {
    if (applicationContext !== null) return;

    // 1. 挂载根目录路径
    globalThis.__dirname = rootPath;

    // 2. 挂载基础全局工具函数
    Object.assign(globalThis, globalUtils);

    // 3. 挂载路径拼接函数（支持 '@' 映射根目录）
    globalThis.__join = (...args) => {
        if (!args || args.length === 0) return "";
        if (args[0] && args[0].startsWith("@")) {
            args[0] = args[0].replace(/^@/, "");
            args = [rootPath, ...args];
        }
        return pathJoin(...args);
    };

    // 4. 创建应用配置上下文 (YAML)
    applicationContext = createContext(pathJoin(rootPath, 'resource'), 'yaml');

    // 5. 挂载命令行参数
    globalThis.__args = getProcessArgs();

    // 6. 注册多级别全局日志器 (__log)
    registerLogger();

    // 7. 加载并挂载环境配置管理器 (__env)
    await reloadApplicationContext();
    globalThis.__env = {
        get: (key, defaultValue) => applicationContext.getProperty(key, defaultValue),
        getEvaluate: (key, defaultValue) => {
            const value = applicationContext.getProperty(key, defaultValue);
            try {
                return evaluate(value);
            } catch (err) {
                __log.error(`[Environment] Get '${key}' evaluate failed: '${value}'. `
                    + `Use default value: ${defaultValue}`, err?.message ?? err);
                return defaultValue;
            }
        },
        subscribe: (sub) => applicationContext.addListen(sub),
        unsubscribe: (sub) => applicationContext.removeListen(sub),
        isDev: () => applicationContext.isActive?.('dev')
    };

    // 8. 启动日志后台工作线程 (Worker)
    setupLoggerWorker(__env.get('logger.savePath'));

    // 9. 初始化数据库并挂载实例
    await initializeDB();
    globalThis.__sqliteDB = getSqliteDB();
    globalThis.__redisClient = getRedisClient();

    // 10. 初始化 SSH 脚本服务
    initializeSshScripts();
}

/**
 * 进程销毁前的清理钩子（优雅关闭日志 Worker 及写入缓存）
 * @returns {Promise<void>}
 */
async function beforeDestroy() {
    await destroyLogger();
}

/**
 * 尝试启动应用程序主入口封装函数（负责全局初始化、异常捕获与安全退出）
 * @param {string} rootPath - 应用程序根目录绝对路径
 * @param {() => Promise<void>|void} callback - 应用程序业务启动回调
 * @returns {Promise<void>}
 */
export async function tryStartApplication(rootPath, callback) {
    await setupGlobal(rootPath);
    try {
        await callback();
    } catch (ex) {
        __log.print(ex);
        await beforeDestroy();
        process.exit(0);
    }
}

/**
 * 重新加载应用程序配置上下文（并同步更新日志级别与通知所有配置订阅者）
 * @returns {Promise<void>}
 */
export async function reloadApplicationContext() {
    const config = await applicationContext.load();
    setupLoggerLevel(config?.logger?.level);
    applicationContext.refreshContext();
}