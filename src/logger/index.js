import { dateFormatForLog } from '../common/dateUtil.js';
import { LogWorker } from './logger.js';

const generateLogNowFormat = process.env.APP_ENV === 'k3s-pod' ?
    () => '' :
    timestamp => {
        const now = dateFormatForLog(timestamp)
        return `[${now}] `
    }

const LOGGER_LEVEL = {
    ORIGIN: {
        value: -2,
        print: (msgArr) => console.log(...msgArr),
        worker: (msgArr) => logWorker?.log('origin', msgArr.join(' '))
    },
    LOG: {
        value: -1,
        print: (msgArr) => console.log('>', ...msgArr),
        worker: (msgArr) => logWorker?.log('print', msgArr.join(' '))
    },
    ERROR: {
        value: 0,
        print: (msgArr, timestamp) => console.error(`${generateLogNowFormat(timestamp)}[ERROR]`, ...msgArr),
        worker: (msgArr, timestamp) => logWorker?.log('error', msgArr.join(' '), timestamp)
    },
    WARN: {
        value: 1,
        print: (msgArr, timestamp) => console.warn(`${generateLogNowFormat(timestamp)}[WARN ]`, ...msgArr),
        worker: (msgArr, timestamp) => logWorker?.log('warn', msgArr.join(' '), timestamp)
    },
    INFO: {
        value: 2,
        print: (msgArr, timestamp) => console.log(`${generateLogNowFormat(timestamp)}[INFO ]`, ...msgArr),
        worker: (msgArr, timestamp) => logWorker?.log('info', msgArr.join(' '), timestamp)
    },
    DEBUG: {
        value: 3,
        print: (msgArr, timestamp) => console.log(`${generateLogNowFormat(timestamp)}[DEBUG]`, ...msgArr),
        worker: (msgArr, timestamp) => logWorker?.log('debug', msgArr.join(' '), timestamp)
    },
}

const shouldPrint = (level, message) => message.length > 0 && globalLoggerLevel >= level.value

function formatMessage(message, lineBreaker = '\n') {
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

function handleLog(level, ...message) {
    const timestamp = Date.now()
    const msgArr = formatMessage(message)
    shouldPrint(level, message) && level.print(msgArr, timestamp)
    level.worker(msgArr, timestamp)
}

let globalLoggerLevel = LOGGER_LEVEL.INFO.value

let logWorker = null

export function setupGlobalLogFunc() {
    logWorker = new LogWorker()
    Object.assign(globalThis, {
        __log: {
            log: (...message) => handleLog(LOGGER_LEVEL.LOG, ...message),
            print: (...message) => handleLog(LOGGER_LEVEL.ORIGIN, ...message),
            info: (...message) => handleLog(LOGGER_LEVEL.INFO, ...message),
            warn: (...message) => handleLog(LOGGER_LEVEL.WARN, ...message),
            debug: (...message) => handleLog(LOGGER_LEVEL.DEBUG, ...message),
            error: (...message) => handleLog(LOGGER_LEVEL.ERROR, ...message)
        }
    })
}

export function initializeLogger(logPath) {
    if (logPath) {
        logWorker?.initialize(__join(logPath))
    }
}

export function setupLoggerLevel(logLevel = 'INFO') {
    globalLoggerLevel = LOGGER_LEVEL[logLevel.toLocaleUpperCase()]?.value ?? LOGGER_LEVEL.INFO.value
}