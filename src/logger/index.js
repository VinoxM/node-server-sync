import { dateFormatForLog } from '../common/dateUtil.js';
import { LogWorker } from './logger.js';

const generateLogNowFormat = process.env.APP_ENV === 'k3s-pod' ?
    () => '' :
    timestamp => {
        const now = dateFormatForLog(timestamp)
        return `[${now}] `
    }

function origin(...message) {
    const msgArr = formatMessage(message)
    if (message && message.length > 0) {
        console.log(...msgArr);
    }
    logWorker?.log('origin', msgArr.join(' '))
}

function print(...message) {
    const msgArr = formatMessage(message)
    if (message && message.length > 0) {
        console.log(`>`, ...msgArr);
    }
    logWorker?.log('print', msgArr.join(' '))
}

function logger(...message) {
    const msgArr = formatMessage(message)
    const timestamp = new Date().getTime()
    if (loggerLevel >= loggerLevelDict.info && message && message.length > 0) {
        const now = generateLogNowFormat(timestamp)
        console.log(`${now}[INFO ]`, ...msgArr);
    }
    logWorker?.log('info', msgArr.join(' '), timestamp)
}

function warning(...message) {
    const msgArr = formatMessage(message)
    const timestamp = new Date().getTime()
    if (loggerLevel >= loggerLevelDict.warning && message && message.length > 0) {
        const now = generateLogNowFormat(timestamp)
        console.log(`${now}[WARN ]`, ...msgArr);
    }
    logWorker?.log('warn', msgArr.join(' '), timestamp)
}

function debug(...message) {
    const msgArr = formatMessage(message)
    const timestamp = new Date().getTime()
    if (loggerLevel >= loggerLevelDict.debug && message && message.length > 0) {
        const now = generateLogNowFormat(timestamp)
        console.log(`${now}[DEBUG]`, ...msgArr);
    }
    logWorker?.log('debug', msgArr.join(' '), timestamp)
}

function error(...message) {
    const msgArr = formatMessage(message)
    const timestamp = new Date().getTime()
    if (message && message.length > 0) {
        const now = generateLogNowFormat(timestamp)
        console.error(`${now}[ERROR]`, ...msgArr);
    }
    logWorker?.log('error', msgArr.join(' '), timestamp)
}

function formatMessage(message, lineBreaker = '\n') {
    let lastLineBreak = false
    const msgArr = []
    for (const obj of message) {
        if (obj === null || obj === undefined) {
            msgArr.push(obj)
            continue
        }
        if (obj instanceof Error) {
            if (lastLineBreak) {
                msgArr.push(lineBreaker)
                lastLineBreak = false
            }
            msgArr.push(obj)
            continue
        }
        if (typeof obj === 'number') {
            msgArr.push(obj)
            continue
        }
        if (typeof obj === 'boolean') {
            msgArr.push(obj)
            continue
        }
        let str = typeof obj === 'object' ? JSON.stringify(obj, null, 2) : obj
        if (str === '') {
            continue
        }
        if (lastLineBreak) {
            str = lineBreaker + str
        }
        if (str.endsWith(lineBreaker)) {
            lastLineBreak = true
            str = str.substring(0, str.length - 1)
        } else {
            lastLineBreak = false
        }
        msgArr.push(str)
    }
    return msgArr
}

let loggerLevel = 1

const loggerLevelDict = {
    'warning': 1,
    'info': 2,
    'debug': 3,
}

let logWorker = null

export function setupGlobalLogFunc() {
    logWorker = new LogWorker()
    Object.assign(globalThis, {
        __log: {
            log: origin,
            print,
            info: logger,
            warn: warning,
            debug,
            error
        }
    })
}

export function initializeLogger(logPath) {
    if (logPath) {
        logWorker?.initialize(__join(logPath))
    }
}

export function setupLoggerLevel(logLevel) {
    loggerLevel = loggerLevelDict[logLevel || 'info'] ?? 3
}