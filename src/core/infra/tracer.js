import { AsyncLocalStorage } from 'async_hooks';
import { generateSnowflake } from '../../common/utils/cryptoUtil.js';
import { resolveStreamMessage } from '../../common/utils/requestUtil.js';

const storage = new AsyncLocalStorage();

export const Tracer = {
    generateTraceId: (prefix = "SYSTEM") => {
        const unique = generateSnowflake()
        return `${prefix}_${unique}`
    },
    run: (data, fn) => storage.run(data, fn),
    runClearly: fn => storage.run(undefined, fn),
    getTraceId: () => storage.getStore()?.traceId ?? '-',
    getStore: () => storage.getStore(),
    runWithPrefix: (prefix, fn) => {
        const traceId = Tracer.generateTraceId(prefix)
        Tracer.run({ traceId }, fn)
    },
    tryStreamMessage: (message, event = 'message', res) => {
        const context = storage.getStore()
        res ??= context?.response
        if (!res || res.destroyed || res.writableEnded) {
            return;
        }
        if (!res.headersSent) {
            res?.setHeader?.('X-Accel-Buffering', 'no');
            res?.setHeader?.('Content-Type', 'text/event-stream')
            res?.setHeader?.('Cache-Control', 'no-cache')
            res?.setHeader?.('Connection', 'keep-alive')
            res?.setHeader?.('Access-Control-Allow-Origin', '*')
            res?.flushHeaders?.();
            context.streamKeepAlive = setInterval(() => {
                __log.debug(`[Request Stream] Heartbeat.`)
                res?.write?.(': keep-alive\n\n')
            }, 10000)
        }
        res?.write(`event: ${event}\n`)
        const msgArr = resolveStreamMessage(message)
        for (const msg of msgArr) {
            res?.write(msg)
        }
    },
    clearStreamHeartbeat: () => {
        const context = storage.getStore()
        if (context?.streamKeepAlive) clearInterval(context?.streamKeepAlive)
    }
};