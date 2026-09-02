import { workerData, parentPort } from 'worker_threads';
import fs from 'fs';
import path from 'path';

/**
 * 判断字符串是否非空
 * @param {any} str - 目标字符串
 * @returns {boolean}
 */
function isNotBlank(str) {
    return str !== null && str !== undefined && ("" + str).trim() !== "";
}

/**
 * 字符左侧补齐
 * @param {any} str - 原始文本
 * @param {number} [maxLength=2] - 目标长度
 * @param {string} [fillString='0'] - 填充字符
 * @returns {string}
 */
function padStart(str, maxLength = 2, fillString = '0') {
    return (str + "").padStart(maxLength, fillString);
}

/**
 * 字符右侧补齐
 * @param {any} str - 原始文本
 * @param {number} [maxLength=2] - 目标长度
 * @param {string} [fillString='0'] - 填充字符
 * @returns {string}
 */
function padEnd(str, maxLength = 2, fillString = '0') {
    return (str + "").padEnd(maxLength, fillString);
}

/**
 * 日期格式化工具
 * @param {Date} d - 日期对象
 * @param {string} [formatStr] - 格式化模板
 * @param {boolean} [is30Hours=false] - 是否采用 30 小时制
 * @returns {string}
 */
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

/**
 * 格式化日志输出专用时间字符串 (yyyy/MM/dd HH:mm:ss.ms)
 * @param {Date|number} [d] - 时间对象或毫秒数
 * @returns {string}
 */
function dateFormatForLog(d) {
    const date = d ? new Date(d) : new Date();
    return dateFormat(date, "yyyy/MM/dd HH:mm:ss.ms");
}

/**
 * 将日志结构体转换为单行格式化字符串
 * @param {{ timestamp: number, level: string, message: string, traceId?: string }} logEntry - 日志记录
 * @param {number} [stdMaxLen=5] - 级别标签对齐宽度
 * @returns {string}
 */
function convertLogMessage({ timestamp, level, message, traceId }, stdMaxLen = 5) {
    let str = '';
    const traceStr = traceId && traceId !== '-' ? ` [${traceId}]` : '';
    switch (level) {
        case 'origin':
            str = message;
            break;
        case 'print':
            str = `[${dateFormatForLog(timestamp)}] >${traceStr} ${message}`;
            break;
        case 'initialized':
            str = `\r\n ------ Started: ${dateFormatForLog(timestamp)} ------ \r\n`;
            break;
        case 'closed':
            str = `\r\n ------ Stopped: ${dateFormatForLog(timestamp)} ------ \r\n`;
            break;
        default:
            str = `[${dateFormatForLog(timestamp)}] [${padEnd(String(level).toLocaleUpperCase(), stdMaxLen, ' ')}]${traceStr} ${message}`;
    }
    return str;
}

/**
 * 后台日志工作线程核心处理器（负责批量异步写文件与日志滚动轮转）
 */
class AdvancedLogger {
    /** @type {string} 目标日志文件绝对路径 */
    #logFile;

    /** @type {number} 单个日志文件最大字节数上限 (超出触发轮转) */
    #maxFileSize;

    /** @type {number} 最大历史轮转文件保留个数 */
    #maxFiles;

    /** @type {number} 缓冲区定期刷盘间隔时间 (毫秒) */
    #flushInterval;

    /** @type {Array<{ timestamp: number, level: string, message: string, traceId?: string }>} 内存日志待写缓冲区 */
    #buffer = [];

    /** @type {{ logsWritten: number, bytesWritten: number, rotations: number }} 运行统计计数器 */
    #stats;

    /** @type {boolean} 是否已初始化 */
    #initialized = false;

    /** @type {NodeJS.Timeout|null} 定时刷盘定时器 */
    #flushTimer = null;

    /** @type {number} 日志级别右填充宽度 */
    #stdMaxLen = 5;

    /**
     * @param {Object} options - 初始化选项
     * @param {string} options.basePath - 存储目录
     * @param {string} options.fileName - 文件名
     * @param {number} options.maxFileSize - 单文件最大大小
     * @param {number} options.maxFiles - 最大历史文件数
     * @param {number} options.flushInterval - 刷盘间隔 (毫秒)
     * @param {number} options.stdMaxLen - 级别对齐宽度
     */
    constructor(options) {
        const { fileName, stdMaxLen } = options;
        this.#logFile = path.join(options.basePath, fileName);
        this.#stdMaxLen = stdMaxLen;
        this.#maxFileSize = options.maxFileSize;
        this.#maxFiles = options.maxFiles;
        this.#flushInterval = options.flushInterval;
        this.#stats = {
            logsWritten: 0,
            bytesWritten: 0,
            rotations: 0
        };
        this.#initialize();
    }

    async #initialize() {
        this.#startFlushTimer();
        this.#initialized = true;
    }

    /**
     * 写入一条日志到缓冲区，缓冲区超过 1000 条时自动触发即时刷盘
     * @param {string} message - 日志内容
     * @param {string} level - 日志级别
     * @param {number} [timestamp] - 时间戳
     * @param {string} [traceId='-'] - TraceId
     * @returns {Promise<void>}
     */
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

    /**
     * 强制将内存缓冲区中的日志批量写入磁盘
     * @returns {Promise<void>}
     */
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

    /**
     * 检查当前日志文件大小并在超限时触发文件滚动
     * @returns {Promise<void>}
     */
    async #checkAndRotate() {
        try {
            const stats = fs.statSync(this.#logFile);
            if (stats.size > this.#maxFileSize) {
                await this.#rotateLog();
            }
        } catch (error) {
        }
    }

    /**
     * 滚动轮转日志文件 (如 logger.log -> logger.1.log -> logger.2.log)
     * @returns {Promise<void>}
     */
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

    /**
     * 启动定时刷盘定时器
     */
    #startFlushTimer() {
        this.#clearFlushTimer();
        this.#flushTimer = setInterval(async () => {
            try {
                await this.flush();
            } catch (error) {
                console.error('定时刷新失败:', error);
            }
        }, this.#flushInterval);
    }

    /**
     * 清除定时刷盘定时器
     */
    #clearFlushTimer() {
        if (this.#flushTimer) {
            clearInterval(this.#flushTimer);
        }
    }

    /**
     * 获取 Worker 写入统计指标
     * @returns {{ logsWritten: number, bytesWritten: number, rotations: number, bufferSize: number, initialized: boolean }}
     */
    getStats() {
        return {
            ...this.#stats,
            bufferSize: this.#buffer.length,
            initialized: this.#initialized
        };
    }

    /**
     * 停止定时器并完成最后一次刷盘
     * @returns {Promise<void>}
     */
    async close() {
        this.#clearFlushTimer();
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