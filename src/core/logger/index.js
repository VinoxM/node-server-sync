import LogHandler, { LOGGER_LEVEL } from "./logger.js";

const logHandler = new LogHandler(LOGGER_LEVEL.INFO)

export function registerLogger(loggerLevel) {
    if (loggerLevel) {
        logHandler.setLoggerLevel(loggerLevel)
    }
    logHandler.registerLogger(LOGGER_LEVEL.ORIGIN)
    logHandler.registerLogger(LOGGER_LEVEL.LOG)
    logHandler.registerLogger(LOGGER_LEVEL.ERROR)
    logHandler.registerLogger(LOGGER_LEVEL.WARN)
    logHandler.registerLogger(LOGGER_LEVEL.INFO)
    logHandler.registerLogger(LOGGER_LEVEL.DEBUG)
    logHandler.registerGlobalProperty('__log')
}

export function setupLoggerWorker(savePath) {
    logHandler.initializeLoggerWorker(savePath, 'logger.log')
}

export function setupLoggerLevel(loggerLevel = LOGGER_LEVEL.INFO) {
    logHandler.setLoggerLevel(loggerLevel)
}

export async function destroyLogger() {
    await logHandler.close();
}