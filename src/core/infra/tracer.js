import { AsyncLocalStorage } from 'async_hooks';
import { generateSnowflake } from '../../common/utils/cryptoUtil.js';

const storage = new AsyncLocalStorage();

export const Tracer = {
    generateTraceId: (prefix = "SYSTEM") => {
        const unique = generateSnowflake()
        return `${prefix}_${unique}`
    },
    run: (data, fn) => storage.run(data, fn),
    getTraceId: () => storage.getStore()?.traceId ?? '-',
    getStore: () => storage.getStore(),
    runWithPrefix: (prefix, fn) => {
        const traceId = Tracer.generateTraceId(prefix)
        Tracer.run({ traceId }, fn)
    }
};