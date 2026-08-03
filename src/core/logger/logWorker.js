import { workerData, parentPort } from 'worker_threads'
import fs from 'fs'
import path from 'path'

function isNotBlank(str) {
    return str !== null && str !== undefined && ("" + str).trim() !== "";
}

function padStart(str, maxLength = 2, fillString = '0') {
    return (str + "").padStart(maxLength, fillString);
}

function padEnd(str, maxLength = 2, fillString = '0') {
    return (str + "").padEnd(maxLength, fillString);
}

function dateFormat(d, formatStr, is30Hours = false) {
    const dateCopy = new Date(d.getTime());
    const flag = is30Hours && dateCopy.getHours() < 6;
    const date = flag ? new Date(dateCopy.setDate(dateCopy.getDate() - 1)) : dateCopy;
    const year = date.getFullYear();
    const month = padStart(date.getMonth() + 1);
    const day = padStart(date.getDate());
    const hours = padStart(flag ? (date.getHours() + 24) : date.getHours());
    const minutes = padStart(date.getMinutes());
    const seconds = padStart(date.getSeconds());
    const millSeconds = padStart(date.getMilliseconds(), 3);
    let format = isNotBlank(formatStr) ? formatStr : "yyyy-MM-dd HH:mm:ss.ms";
    return format.replace("yyyy", year)
        .replace("MM", month)
        .replace("dd", day)
        .replace("HH", hours)
        .replace("mm", minutes)
        .replace("ss", seconds)
        .replace("ms", millSeconds);
}

function dateFormatForLog(d) {
    const date = d ? new Date(d) : new Date();
    return dateFormat(date, "yyyy/MM/dd HH:mm:ss.ms");
}

function convertLogMessage({ timestamp, level, message, traceId }, stdMaxLen = 5) {
    let str = ''
    const traceStr = traceId && traceId !== '-' ? ` [${traceId}]` : ''
    switch (level) {
        case 'origin':
            str = message
            break;
        case 'print':
            str = `[${dateFormatForLog(timestamp)}] >${traceStr} ${message}`
            break;
        case 'initialized':
            str = `\r\n ------ Started: ${dateFormatForLog(timestamp)} ------ \r\n`
            break;
        case 'closed':
            str = `\r\n ------ Stopped: ${dateFormatForLog(timestamp)} ------ \r\n`
            break;
        default:
            str = `[${dateFormatForLog(timestamp)}] [${padEnd(String(level).toLocaleUpperCase(), stdMaxLen, ' ')}]${traceStr} ${message}`
    }
    return str
}

class AdvancedLogger {
    #logFile
    #maxFileSize
    #maxFiles
    #flushInterval
    #buffer = []
    #stats
    #initialized = false
    #flushTimer = null
    #stdMaxLen = 5

    constructor(options) {
        const { fileName, stdMaxLen } = options
        this.#logFile = path.join(options.basePath, fileName)
        this.#stdMaxLen = stdMaxLen
        this.#maxFileSize = options.maxFileSize
        this.#maxFiles = options.maxFiles
        this.#flushInterval = options.flushInterval
        this.#stats = {
            logsWritten: 0,
            bytesWritten: 0,
            rotations: 0
        }
        this.#initialize();
    }

    async #initialize() {
        this.#startFlushTimer();
        this.#initialized = true;
    }

    async log(message, level, timestamp, traceId = '-') {
        const entry = {
            timestamp: timestamp ?? new Date().getTime(),
            level,
            message,
            traceId
        };
        this.#buffer.push(entry);
        if (this.#buffer.length > 1000) {
            await this.flush();
        }
    }

    async flush() {
        if (this.#buffer.length === 0) return;
        const entries = this.#buffer.splice(0, this.#buffer.length);
        const content = entries.map(o => convertLogMessage(o, this.#stdMaxLen)).join('\r\n') + '\r\n';
        try {
            const dir = path.dirname(this.#logFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.appendFileSync(this.#logFile, content);
            this.#stats.logsWritten += entries.length;
            this.#stats.bytesWritten += Buffer.byteLength(content);
            await this.#checkAndRotate();
        } catch (error) {
            this.#buffer.unshift(...entries);
            throw error;
        }
    }

    async #checkAndRotate() {
        try {
            const stats = fs.statSync(this.#logFile);
            if (stats.size > this.#maxFileSize) {
                await this.#rotateLog();
            }
        } catch (error) {
        }
    }

    async #rotateLog() {
        const ext = path.extname(this.#logFile);
        const base = path.basename(this.#logFile, ext);
        const dir = path.dirname(this.#logFile);
        for (let i = this.#maxFiles - 1; i > 0; i--) {
            const oldFile = path.join(dir, `${base}.${i}${ext}`);
            const newFile = path.join(dir, `${base}.${i + 1}${ext}`);
            if (fs.existsSync(oldFile)) {
                fs.renameSync(oldFile, newFile);
            }
        }
        const firstBackup = path.join(dir, `${base}.1${ext}`);
        fs.renameSync(this.#logFile, firstBackup);
        this.#stats.rotations++;
        parentPort.postMessage({
            type: 'rotate',
            data: {
                oldFile: this.#logFile,
                newFile: firstBackup
            }
        });
    }

    #startFlushTimer() {
        this.#clearFlushTimer()
        this.#flushTimer = setInterval(async () => {
            try {
                await this.flush();
            } catch (error) {
                console.error('定时刷新失败:', error);
            }
        }, this.#flushInterval);
    }

    #clearFlushTimer() {
        if (this.#flushTimer) {
            clearInterval(this.#flushTimer);
        }
    }

    getStats() {
        return {
            ...this.#stats,
            bufferSize: this.#buffer.length,
            initialized: this.#initialized
        };
    }

    async close() {
        this.#clearFlushTimer()
        await this.flush();
    }
}

const logger = new AdvancedLogger(workerData);

parentPort.on('message', async (message) => {
    try {
        switch (message.type) {
            case 'log':
                await logger.log(message.data.message, message.data.level, message.data.timestamp, message.data.traceId);
                parentPort.postMessage({
                    id: message.id,
                    type: 'log_success'
                });
                break;
            case 'flush':
                await logger.flush();
                parentPort.postMessage({
                    id: message.id,
                    type: 'flush_success'
                });
                break;
            case 'stats':
                parentPort.postMessage({
                    id: message.id,
                    type: 'stats',
                    data: logger.getStats()
                });
                break;
            case 'initialized':
                await logger.log(null, 'initialized');
                break;
            case 'close':
                await logger.log(null, 'closed');
                await logger.close();
                parentPort.postMessage({
                    id: message.id,
                    type: 'closed'
                });
        }
    } catch (error) {
        parentPort.postMessage({
            id: message.id,
            type: 'error',
            error: error.message
        });
    }
});