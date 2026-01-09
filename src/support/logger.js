import { dateFormatForLog } from '../common/dateUtil.js';
import { LogWorker } from '../logger/logger.js';

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
    if (loggerLevel >= 1 && message && message.length > 0) {
        const now = dateFormatForLog(timestamp);
        console.log(`[INFO ] [${now}]`, ...msgArr);
    }
    logWorker?.log('info', msgArr.join(' '), timestamp)
}

function warning(...message) {
    const msgArr = formatMessage(message)
    const timestamp = new Date().getTime()
    if (loggerLevel >= 2 && message && message.length > 0) {
        const now = dateFormatForLog(timestamp);
        console.log(`[WARN ] [${now}]`, ...msgArr);
    }
    logWorker?.log('warn', msgArr.join(' '), timestamp)
}

function debug(...message) {
    const msgArr = formatMessage(message)
    const timestamp = new Date().getTime()
    if (loggerLevel >= 3 && message && message.length > 0) {
        const now = dateFormatForLog(timestamp);
        console.log(`[DEBUG] [${now}]`, ...msgArr);
    }
    logWorker?.log('debug', msgArr.join(' '), timestamp)
}

function error(...message) {
    const msgArr = formatMessage(message)
    const timestamp = new Date().getTime()
    if (message && message.length > 0) {
        const now = dateFormatForLog(timestamp);
        console.error(`[ERROR] [${now}]`, ...msgArr);
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
    'info': 1,
    'warning': 2,
    'debug': 3,
}

let logWorker = null

export function setupGlobalLogFunc() {
    logWorker = new LogWorker()
    Object.assign(globalThis, {
        print,
        logger,
        warning,
        debug,
        error,
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