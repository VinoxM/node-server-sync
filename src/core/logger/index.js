import LogHandler, { LOGGER_LEVEL } from "./logger.js";

/** @type {LogHandler} 全局日志处理器单例 */
const logHandler = new LogHandler(LOGGER_LEVEL.INFO);

/**
 * 注册各级别日志输出函数并挂载到全局变量 `__log`
 * @param {import('./logger.js').LoggerLevel|string|number} [loggerLevel] - 可选的初始日志级别
 */
export function registerLogger(loggerLevel) {
    if (loggerLevel) {
        logHandler.setLoggerLevel(loggerLevel);
    }
    logHandler.registerLogger(LOGGER_LEVEL.ORIGIN);
    logHandler.registerLogger(LOGGER_LEVEL.LOG);
    logHandler.registerLogger(LOGGER_LEVEL.ERROR);
    logHandler.registerLogger(LOGGER_LEVEL.WARN);
    logHandler.registerLogger(LOGGER_LEVEL.INFO);
    logHandler.registerLogger(LOGGER_LEVEL.DEBUG);
    logHandler.registerGlobalProperty('__log');
}

/**
 * 启动异步日志落盘 Worker 工作线程与自动文件轮转
 * @param {string} savePath - 日志文件存储根目录
 */
export function setupLoggerWorker(savePath) {
    logHandler.initializeLoggerWorker(savePath, 'logger.log');
}

/**
 * 动态调整全局日志过滤输出级别
 * @param {import('./logger.js').LoggerLevel|string|number} [loggerLevel=LOGGER_LEVEL.INFO] - 目标日志级别
 */
export function setupLoggerLevel(loggerLevel = LOGGER_LEVEL.INFO) {
    logHandler.setLoggerLevel(loggerLevel);
}

/**
 * 优雅销毁日志器（清空并等待异步日志落盘完成）
 * @returns {Promise<void>}
 */
export async function destroyLogger() {
    await logHandler.close();
}