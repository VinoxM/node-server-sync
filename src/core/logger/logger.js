import path from 'path';
import fs from 'fs';
import { Worker } from 'worker_threads';
import { dateFormatForLog } from '../../common/utils/dateUtil.js';
import { Tracer } from '../infra/tracer.js';

/**
 * Default options / Constants
 */
const workerOptions = {
    maxFileSize: 1 * 1024 * 1024,
    maxFiles: 5,
    flushInterval: 2000
}

/**
 * Helpful functions
 */
function isBlankString(str) {
    return str === undefined || str === null || typeof str !== 'string' || str.length === 0
}

function generateLogNowFormat(timestamp) {
    const now = dateFormatForLog(timestamp)
    return `[${now}] `
}

function generateStdLevelPrefix(stdLevelPrefix) {
    if (!isBlankString(stdLevelPrefix)) {
        return (stdLevelPrefix.endsWith(':') ? stdLevelPrefix : (stdLevelPrefix + ':')).toLocaleUpperCase()
    }
    return ''
}

/**
 * Class declares
 */
class LoggerLevel {
    static instance = {
        ORIGIN: new LoggerLevel(-2, 'print'),
        LOG: new LoggerLevel(-1, 'log'),
        ERROR: new LoggerLevel(0, 'error'),
        WARN: new LoggerLevel(1, 'warn'),
        INFO: new LoggerLevel(2, 'info'),
        DEBUG: new LoggerLevel(3, 'debug')
    }
    static of(level) {
        if (level instanceof LoggerLevel) {
            return level
        }
        if (typeof level === 'number') {
            return Object.values(LoggerLevel.instance).find(l => l.value === level) ?? LoggerLevel.instance.INFO
        }
        if (typeof level === 'string') {
            const levelNum = parseInt(level)
            return Object.values(LoggerLevel.instance).find(l => l.value === levelNum || l.label === level) ?? LoggerLevel.instance.INFO
        }
        return LoggerLevel.instance.INFO
    }
    #value = 0;
    // register to global function name
    #label = 'log';
    constructor(value, label) {
        if (!Number.isInteger(value)) throw new Error(`LoggerLevel value must be integer.`);
        this.#value = value;
        if (isBlankString(label)) throw new Error(`LoggerLevel label cannot be blank.`);
        this.#label = label;
    }
    get value() { return this.#value }
    get label() { return this.#label }
}

const LOGGER_LEVEL_PRINTER = new Map([
    [LoggerLevel.instance.ORIGIN, (msgArr) => console.log(...msgArr)],
    [LoggerLevel.instance.LOG, (msgArr) => console.log(`>`, ...msgArr)],
    [LoggerLevel.instance.ERROR, (msgArr, timestamp, stdPrefix = '') => console.error(`${generateLogNowFormat(timestamp)}[${stdPrefix}ERROR]`, ...msgArr)],
    [LoggerLevel.instance.WARN, (msgArr, timestamp, stdPrefix = '') => console.warn(`${generateLogNowFormat(timestamp)}[${stdPrefix}WARN ]`, ...msgArr)],
    [LoggerLevel.instance.INFO, (msgArr, timestamp, stdPrefix = '') => console.log(`${generateLogNowFormat(timestamp)}[${stdPrefix}INFO ]`, ...msgArr)],
    [LoggerLevel.instance.DEBUG, (msgArr, timestamp, stdPrefix = '') => console.log(`${generateLogNowFormat(timestamp)}[${stdPrefix}DEBUG]`, ...msgArr)],
])

class Logger {
    #level;
    // after print message to std callback
    #afterPrint;
    #stdPrefix;
    constructor(level, stdPrefix = '', afterPrint) {
        if (!(level instanceof LoggerLevel)) throw new Error(`Logger level must be LoggerLevel instance.`);
        this.#level = level;
        this.setAfterPrint(afterPrint)
    }
    get level() {
        return this.#level;
    }
    setAfterPrint(afterPrint) {
        if (!afterPrint) return;
        else if (typeof afterPrint !== 'function') throw new Error(`Logger afterPrint must be function.`);
        this.#afterPrint = afterPrint
    }
    afterPrint(msgArr, timestamp) {
        this.#afterPrint?.(msgArr, timestamp)
    }
}

class LogHandler {
    #loggerMapping = new Map();
    #loggerLevel = LoggerLevel.instance.INFO;
    #logWorker = new LogWorker();
    #stdLevelPrefix = '';

    constructor(loggerLevel, stdLevelPrefix = '') {
        this.setLoggerLevel(loggerLevel, true)
        this.#stdLevelPrefix = generateStdLevelPrefix(stdLevelPrefix)
    }

    get loggerLevel() {
        return this.#loggerLevel.label
    }

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

    #shouldPrint(level, message) {
        return message.length > 0 && this.#loggerLevel.value >= level.value
    }

    #handleLog(level, ...message) {
        const timestamp = Date.now()
        const msgArr = this.#formatMessage(message)
        if (this.#shouldPrint(level, message)) {
            LOGGER_LEVEL_PRINTER.get(level)?.(msgArr, timestamp, this.#stdLevelPrefix)
        }
        if (this.#logWorker.ready) {
            const traceId = Tracer.getTraceId()
            this.#logWorker.log(level.label, msgArr.join(' '), timestamp, traceId)
        }
        const logger = this.#loggerMapping.get(level)
        logger?.afterPrint(msgArr, timestamp)
    }

    initializeLoggerWorker(savePath, fileName) {
        this.#logWorker.initialize(savePath, fileName, this.#stdLevelPrefix)
    }

    setLoggerLevel(loggerLevel, ignorePrint = false) {
        this.#loggerLevel = LoggerLevel.of(loggerLevel);
        ignorePrint || this.#handleLog(this.#loggerLevel, `[LogHandler] Setup logger level: ${this.#loggerLevel.label}`)
    }

    registerLogger(logLevel, afterPrint) {
        this.#loggerMapping.set(logLevel, new Logger(logLevel, afterPrint))
    }

    registerLoggerAfterPrint(logLevel, afterPrint) {
        const logger = this.#loggerMapping.get(logLevel)
        logger?.setAfterPrint?.(afterPrint)
    }

    registerGlobalProperty(propertyName) {
        if (isBlankString(propertyName)) return;
        const globalLog = {};
        this.#loggerMapping.forEach((logger, level) => {
            globalLog[level.label] = (...message) => this.#handleLog(level, ...message)
        })
        Object.assign(globalThis, { [propertyName]: Object.freeze(globalLog) })
    }
}

class LogWorker {
    #worker
    #pending = new Map()
    #messageId = 0
    #initialized = false

    #buffer = []

    #levelPrefix = ''

    constructor() {
    }

    get ready() {
        return this.#initialized
    }

    initialize(basePath, fileName = 'logger.log', stdLevelPrefix = '') {
        if (this.#initialized) return
        const folder = __join(basePath)
        fs.existsSync(folder) || fs.mkdirSync(folder, { recursive: true })
        if (!fs.lstatSync(folder).isDirectory()) {
            throw new Error(`${folder} not a directory.`)
        }
        this.#levelPrefix = generateStdLevelPrefix(stdLevelPrefix);
        this.log('debug', `Logger use basePath: ${basePath}`)
        this.#worker = new Worker(new URL('./logWorker.js', import.meta.url), {
            workerData: {
                basePath: folder,
                fileName,
                stdMaxLen: 5 + this.#levelPrefix.length,
                ...workerOptions
            }
        })
        this.#setupWorker()
        this.#setupProcessExit()
        this.#initialized = true
        this.#send('initialized')
        for (const b of this.#buffer) {
            const { type, data, timestamp } = b
            this.#post(type, data, timestamp)
        }
    }

    #setupWorker() {
        const worker = this.#worker
        worker.on('message', ({ id, type, data, error }) => {
            const callback = this.#pending.get(id);

            if (callback) {
                if (error) {
                    console.log(error)
                    callback.reject(new Error(error));
                } else {
                    callback.resolve(data);
                }
                this.#pending.delete(id);
            }

            if (type === 'rotate') {
                console.log(`日志文件轮转: ${data.oldFile} -> ${data.newFile}`);
            }
        })
        worker.on('error', (error) => {
            console.error('Worker 错误:', error)
        })
        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Worker 停止，退出码: ${code}`)
            }
        })
    }

    #setupProcessExit() {
        const shutdown = async () => {
            await this.close()
            process.exit(0)
        }
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
        process.on('beforeExit', async () => { await shutdown() });
    }

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

    async #send(type, data = {}, timestamp) {
        timestamp ??= new Date().getTime()
        if (this.#initialized) {
            return this.#post(type, data, timestamp)
        } else {
            this.#buffer.push({ type, data, timestamp })
            return Promise.resolve()
        }
    }

    async #flush() {
        return this.#send('flush');
    }

    async getStats() {
        return this.#send('stats');
    }

    async log(logLevel, message, timestamp, traceId) {
        return this.#send('log', {
            message: message,
            level: this.#levelPrefix + logLevel,
            traceId
        }, timestamp)
    }

    async close() {
        await this.#flush();
        return new Promise((resolve, reject) => {
            const id = ++this.#messageId;
            this.#pending.set(id, { resolve, reject });
            this.#worker.postMessage({ id, type: 'close' });
        });
    }
}

export const LOGGER_LEVEL = Object.freeze(LoggerLevel.instance)
export default LogHandler;