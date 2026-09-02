import fs from 'fs';
import { Worker } from 'worker_threads';
import { dateFormatForLog } from '#utils/dateUtil.js';
import { Tracer } from '../infra/tracer.js';

/**
 * 默认 Worker 异步日志落盘配置项
 */
const workerOptions = {
    maxFileSize: 1 * 1024 * 1024,
    maxFiles: 5,
    flushInterval: 2000
};

/**
 * 判断字符串是否为空白
 * @param {any} str - 待校验字符串
 * @returns {boolean}
 */
function isBlankString(str) {
    return str === undefined || str === null || typeof str !== 'string' || str.length === 0;
}

/**
 * 生成控制台当前时间前缀
 * @param {number} timestamp - 毫秒时间戳
 * @returns {string} 格式如 `[2026/09/02 12:00:00.000] `
 */
function generateLogNowFormat(timestamp) {
    const now = dateFormatForLog(timestamp);
    return `[${now}] `;
}

/**
 * 生成日志级别标准化前缀
 * @param {string} stdLevelPrefix
 * @returns {string}
 */
function generateStdLevelPrefix(stdLevelPrefix) {
    if (!isBlankString(stdLevelPrefix)) {
        return (stdLevelPrefix.endsWith(':') ? stdLevelPrefix : (stdLevelPrefix + ':')).toLocaleUpperCase();
    }
    return '';
}

/**
 * 生成控制台 TraceId 输出标识
 * @param {string} traceId - Trace 标识
 * @returns {string}
 */
function generateTraceStd(traceId) {
    if (isBlankString(traceId) || traceId === '-') {
        return '';
    }
    return ` [${traceId}]`;
}

/**
 * 日志级别模型类
 */
export class LoggerLevel {
    /** @type {{ ORIGIN: LoggerLevel, LOG: LoggerLevel, ERROR: LoggerLevel, WARN: LoggerLevel, INFO: LoggerLevel, DEBUG: LoggerLevel }} 预定义级别常量集合 */
    static instance = {
        ORIGIN: new LoggerLevel(-2, 'print'),
        LOG: new LoggerLevel(-1, 'log'),
        ERROR: new LoggerLevel(0, 'error'),
        WARN: new LoggerLevel(1, 'warn'),
        INFO: new LoggerLevel(2, 'info'),
        DEBUG: new LoggerLevel(3, 'debug')
    };

    /**
     * 将输入参数转换为标准 LoggerLevel 实例
     * @param {LoggerLevel|number|string} level - 级别入参
     * @returns {LoggerLevel} 标准级别对象
     */
    static of(level) {
        if (level instanceof LoggerLevel) {
            return level;
        }
        if (typeof level === 'number') {
            return Object.values(LoggerLevel.instance).find(l => l.value === level) ?? LoggerLevel.instance.INFO;
        }
        if (typeof level === 'string') {
            const levelNum = parseInt(level);
            return Object.values(LoggerLevel.instance).find(l => l.value === levelNum || l.label === level) ?? LoggerLevel.instance.INFO;
        }
        return LoggerLevel.instance.INFO;
    }

    /** @type {number} 级别数值优先级 */
    #value = 0;

    /** @type {string} 级别名称标识（用于挂载为全局方法名） */
    #label = 'log';

    /**
     * @param {number} value - 级别权重值
     * @param {string} label - 级别方法名称
     */
    constructor(value, label) {
        if (!Number.isInteger(value)) throw new Error(`LoggerLevel value must be integer.`);
        this.#value = value;
        if (isBlankString(label)) throw new Error(`LoggerLevel label cannot be blank.`);
        this.#label = label;
    }

    /** @returns {number} */
    get value() { return this.#value; }

    /** @returns {string} */
    get label() { return this.#label; }
}

/** @type {Map<LoggerLevel, (msgArr: any[], timestamp: number, stdPrefix: string, traceId: string) => void>} 控制台打印处理器映射表 */
const LOGGER_LEVEL_PRINTER = new Map([
    [LoggerLevel.instance.ORIGIN, (msgArr) => console.log(...msgArr)],
    [LoggerLevel.instance.LOG, (msgArr) => console.log(`>`, ...msgArr)],
    [LoggerLevel.instance.ERROR, (msgArr, timestamp, stdPrefix = '', traceId) => console.error(`${generateLogNowFormat(timestamp)}[${stdPrefix}ERROR]${generateTraceStd(traceId)}`, ...msgArr)],
    [LoggerLevel.instance.WARN, (msgArr, timestamp, stdPrefix = '', traceId) => console.warn(`${generateLogNowFormat(timestamp)}[${stdPrefix}WARN ]${generateTraceStd(traceId)}`, ...msgArr)],
    [LoggerLevel.instance.INFO, (msgArr, timestamp, stdPrefix = '', traceId) => console.log(`${generateLogNowFormat(timestamp)}[${stdPrefix}INFO ]${generateTraceStd(traceId)}`, ...msgArr)],
    [LoggerLevel.instance.DEBUG, (msgArr, timestamp, stdPrefix = '', traceId) => console.log(`${generateLogNowFormat(timestamp)}[${stdPrefix}DEBUG]${generateTraceStd(traceId)}`, ...msgArr)],
]);

/**
 * 单个日志级别实体包装类
 */
class Logger {
    /** @type {LoggerLevel} 日志级别 */
    #level;

    /** @type {((msgArr: any[], timestamp: number) => void)|undefined} 输出完成后的钩子回调 */
    #afterPrint;

    /** @type {string} 前缀 */
    #stdPrefix;

    /**
     * @param {LoggerLevel} level
     * @param {string} [stdPrefix='']
     * @param {(msgArr: any[], timestamp: number) => void} [afterPrint]
     */
    constructor(level, stdPrefix = '', afterPrint) {
        if (!(level instanceof LoggerLevel)) throw new Error(`Logger level must be LoggerLevel instance.`);
        this.#level = level;
        this.setAfterPrint(afterPrint);
    }

    get level() {
        return this.#level;
    }

    setAfterPrint(afterPrint) {
        if (!afterPrint) return;
        else if (typeof afterPrint !== 'function') throw new Error(`Logger afterPrint must be function.`);
        this.#afterPrint = afterPrint;
    }

    afterPrint(msgArr, timestamp) {
        this.#afterPrint?.(msgArr, timestamp);
    }
}

/**
 * 多级别日志调度与全局管理核心类
 */
class LogHandler {
    /** @type {Map<LoggerLevel, Logger>} 级别到 Logger 实例映射字典 */
    #loggerMapping = new Map();

    /** @type {LoggerLevel} 当前全局生效的最低日志级别 */
    #loggerLevel = LoggerLevel.instance.INFO;

    /** @type {LogWorker} 异步日志文件落盘 Worker 调度器 */
    #logWorker = new LogWorker();

    /** @type {string} 日志级别全局前缀 */
    #stdLevelPrefix = '';

    /**
     * @param {LoggerLevel|number|string} loggerLevel - 初始日志级别
     * @param {string} [stdLevelPrefix=''] - 级别输出前缀
     */
    constructor(loggerLevel, stdLevelPrefix = '') {
        this.setLoggerLevel(loggerLevel, true);
        this.#stdLevelPrefix = generateStdLevelPrefix(stdLevelPrefix);
    }

    get loggerLevel() {
        return this.#loggerLevel.label;
    }

    /**
     * 将多种类型的消息入参格式化为字符串数组 (支持 Error 栈展开与 Object JSON 美化)
     * @param {any[]} message - 待格式化参数
     * @param {string} [lineBreaker='\n'] - 换行符
     * @returns {any[]}
     */
    #formatMessage(message, lineBreaker = '\n') {
        if (!message || message.length === 0) return [];
        return message.map((obj, index) => {
            if (obj === null || obj === undefined || typeof obj === 'number' || typeof obj === 'boolean') {
                return obj;
            }
            if (obj instanceof Error) {
                return (index > 0 ? lineBreaker : '') + (obj.stack || obj.message);
            }
            if (typeof obj === 'object') {
                try {
                    const json = JSON.stringify(obj, null, 2);
                    return (index > 0 ? lineBreaker : '') + json;
                } catch (err) {
                    return `[Object Unserializable: ${err.message}]`;
                }
            }
            if (typeof obj === 'string') {
                return obj.replace(/\n$/, '');
            }
            return String(obj);
        });
    }

    /**
     * 判断当前级别是否满足输出阈值
     * @param {LoggerLevel} level - 待输出级别
     * @param {any[]} message - 消息入参
     * @returns {boolean}
     */
    #shouldPrint(level, message) {
        return message.length > 0 && this.#loggerLevel.value >= level.value;
    }

    /**
     * 核心日志调度输出逻辑（包含控制台彩色打印、TraceId 提取、异步落盘 Worker 转发与钩子回调）
     * @param {LoggerLevel} level
     * @param {...any} message
     */
    #handleLog(level, ...message) {
        const timestamp = Date.now();
        const msgArr = this.#formatMessage(message);
        const traceId = Tracer.getTraceId();
        if (this.#shouldPrint(level, message)) {
            LOGGER_LEVEL_PRINTER.get(level)?.(msgArr, timestamp, this.#stdLevelPrefix, traceId);
        }
        if (this.#logWorker.ready) {
            this.#logWorker.log(level.label, msgArr.join(' '), timestamp, traceId);
        }
        const logger = this.#loggerMapping.get(level);
        logger?.afterPrint(msgArr, timestamp);
    }

    /**
     * 初始化异步日志 Worker
     * @param {string} savePath - 存储路径
     * @param {string} fileName - 文件名
     */
    initializeLoggerWorker(savePath, fileName) {
        this.#logWorker.initialize(savePath, fileName, this.#stdLevelPrefix);
    }

    /**
     * 设置当前生效的日志级别阈值
     * @param {LoggerLevel|number|string} loggerLevel - 日志级别
     * @param {boolean} [ignorePrint=false] - 是否忽略切换日志输出
     */
    setLoggerLevel(loggerLevel, ignorePrint = false) {
        this.#loggerLevel = LoggerLevel.of(loggerLevel);
        ignorePrint || this.#handleLog(this.#loggerLevel, `[LogHandler] Setup logger level: ${this.#loggerLevel.label}`);
    }

    /**
     * 注册指定级别的 Logger
     * @param {LoggerLevel} logLevel
     * @param {(msgArr: any[], timestamp: number) => void} [afterPrint]
     */
    registerLogger(logLevel, afterPrint) {
        this.#loggerMapping.set(logLevel, new Logger(logLevel, afterPrint));
    }

    /**
     * 注册指定级别打印后的钩子回调
     * @param {LoggerLevel} logLevel
     * @param {(msgArr: any[], timestamp: number) => void} afterPrint
     */
    registerLoggerAfterPrint(logLevel, afterPrint) {
        const logger = this.#loggerMapping.get(logLevel);
        logger?.setAfterPrint?.(afterPrint);
    }

    /**
     * 将所有已注册的日志方法挂载到 globalThis 上的指定全局变量 (如 `__log`)
     * @param {string} propertyName - 全局属性名
     */
    registerGlobalProperty(propertyName) {
        if (isBlankString(propertyName)) return;
        const globalLog = {};
        this.#loggerMapping.forEach((logger, level) => {
            globalLog[level.label] = (...message) => this.#handleLog(level, ...message);
        });
        Object.assign(globalThis, { [propertyName]: Object.freeze(globalLog) });
    }

    /**
     * 关闭日志处理器与落盘 Worker
     * @returns {Promise<void>}
     */
    async close() {
        await this.#logWorker.close();
    }
}

/**
 * 主线程与后台日志 Worker 通信封装类
 */
class LogWorker {
    /** @type {Worker} Node.js 工作线程实例 */
    #worker;

    /** @type {Map<number, { resolve: Function, reject: Function }>} 消息响应等待 Promise 回调 Map */
    #pending = new Map();

    /** @type {number} 消息自增 ID */
    #messageId = 0;

    /** @type {boolean} 是否已初始化完毕 */
    #initialized = false;

    /** @type {Array<{ type: string, data: any, timestamp: number }>} 初始化前暂存消息的内存队列 */
    #buffer = [];

    /** @type {string} 级别前缀 */
    #levelPrefix = '';

    constructor() {
    }

    get ready() {
        return this.#initialized;
    }

    /**
     * 启动并初始化后台工作线程
     * @param {string} basePath - 日志目录
     * @param {string} [fileName='logger.log'] - 文件名
     * @param {string} [stdLevelPrefix=''] - 前缀
     */
    initialize(basePath, fileName = 'logger.log', stdLevelPrefix = '') {
        if (this.#initialized) return;
        const folder = __join(basePath);
        fs.existsSync(folder) || fs.mkdirSync(folder, { recursive: true });
        if (!fs.lstatSync(folder).isDirectory()) {
            throw new Error(`${folder} not a directory.`);
        }
        this.#levelPrefix = generateStdLevelPrefix(stdLevelPrefix);
        this.log('debug', `Logger use basePath: ${basePath}`);
        this.#worker = new Worker(new URL('./logWorker.js', import.meta.url), {
            workerData: {
                basePath: folder,
                fileName,
                stdMaxLen: 5 + this.#levelPrefix.length,
                ...workerOptions
            }
        });
        this.#setupWorker();
        this.#setupProcessExit();
        this.#initialized = true;
        this.#send('initialized');
        for (const b of this.#buffer) {
            const { type, data, timestamp } = b;
            this.#post(type, data, timestamp);
        }
    }

    /**
     * 绑定 Worker 事件监听
     */
    #setupWorker() {
        const worker = this.#worker;
        worker.on('message', ({ id, type, data, error }) => {
            const callback = this.#pending.get(id);

            if (callback) {
                if (error) {
                    console.log(error);
                    callback.reject(new Error(error));
                } else {
                    callback.resolve(data);
                }
                this.#pending.delete(id);
            }

            if (type === 'rotate') {
                console.log(`日志文件轮转: ${data.oldFile} -> ${data.newFile}`);
            }
        });
        worker.on('error', (error) => {
            console.error('Worker 错误:', error);
        });
        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Worker 停止，退出码: ${code}`);
            }
        });
    }

    /**
     * 注册进程退出时的优雅关闭钩子
     */
    #setupProcessExit() {
        const shutdown = async () => {
            await this.close();
            process.exit(0);
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
        process.on('beforeExit', async () => { await shutdown(); });
    }

    /**
     * 向 Worker 发送异步指令并等待响应
     * @param {string} type - 指令类型
     * @param {any} data - 数据载荷
     * @param {number} timestamp - 时间戳
     * @returns {Promise<any>}
     */
    async #post(type, data, timestamp) {
        return new Promise((resolve, reject) => {
            const id = ++this.#messageId;
            this.#pending.set(id, { resolve, reject });

            this.#worker.postMessage({
                id,
                type,
                data: {
                    ...data,
                    timestamp
                }
            });
        });
    }

    /**
     * 发送指令（未就绪时自动先放入缓冲队列）
     * @param {string} type
     * @param {any} [data={}]
     * @param {number} [timestamp]
     * @returns {Promise<any>}
     */
    async #send(type, data = {}, timestamp) {
        timestamp ??= new Date().getTime();
        if (this.#initialized) {
            return this.#post(type, data, timestamp);
        } else {
            this.#buffer.push({ type, data, timestamp });
            return Promise.resolve();
        }
    }

    /**
     * 触发缓冲区刷盘
     * @returns {Promise<any>}
     */
    async #flush() {
        return this.#send('flush');
    }

    /**
     * 获取 Worker 运行指标
     * @returns {Promise<any>}
     */
    async getStats() {
        return this.#send('stats');
    }

    /**
     * 提交一条日志到 Worker 异步写入
     * @param {string} logLevel - 级别
     * @param {string} message - 内容
     * @param {number} timestamp - 时间戳
     * @param {string} traceId - TraceId
     * @returns {Promise<any>}
     */
    async log(logLevel, message, timestamp, traceId) {
        return this.#send('log', {
            message: message,
            level: this.#levelPrefix + logLevel,
            traceId
        }, timestamp);
    }

    /**
     * 关闭 Worker 并等待最后刷盘完成
     * @returns {Promise<void>}
     */
    async close() {
        await this.#flush();
        return new Promise((resolve, reject) => {
            const id = ++this.#messageId;
            this.#pending.set(id, { resolve, reject });
            this.#worker.postMessage({ id, type: 'close' });
        });
    }
}

export const LOGGER_LEVEL = Object.freeze(LoggerLevel.instance);
export default LogHandler;