import { AsyncLocalStorage } from 'async_hooks';
import { generateSnowflake } from '#utils/cryptoUtil.js';
import { resolveStreamMessage } from '#utils/requestUtil.js';

/** @type {AsyncLocalStorage<{ traceId?: string, response?: import('express').Response, streamKeepAlive?: NodeJS.Timeout, [key: string]: any }>} 异步上下文追踪存储器 */
const storage = new AsyncLocalStorage();

/**
 * 全链路追踪 Trace 上下文管理器
 * 基于 Node.js `AsyncLocalStorage` 维护异步调用链上的 TraceId，并支持流式心跳与消息推送
 */
export const Tracer = {
    /**
     * 生成带前缀的全局唯一 TraceId
     * @param {string} [prefix="SYSTEM"] - TraceId 前缀标识
     * @returns {string} 格式如 `REQ_G_123456789` 的 TraceId 字符串
     */
    generateTraceId: (prefix = "SYSTEM") => {
        const unique = generateSnowflake();
        return `${prefix}_${unique}`;
    },

    /**
     * 在指定的追踪上下文数据中运行回调函数
     * @template T
     * @param {Object} data - 上下文数据对象 (包含 traceId, response 等)
     * @param {() => T} fn - 回调函数
     * @returns {T} 回调返回值
     */
    run: (data, fn) => storage.run(data, fn),

    /**
     * 在空上下文中运行回调函数（消除当前 TraceId 影响）
     * @template T
     * @param {() => T} fn - 回调函数
     * @returns {T} 回调返回值
     */
    runClearly: fn => storage.run(undefined, fn),

    /**
     * 获取当前异步上下文的 TraceId（不存在时返回 '-'）
     * @returns {string}
     */
    getTraceId: () => storage.getStore()?.traceId ?? '-',

    /**
     * 获取当前完整的上下文存储对象
     * @returns {{ traceId?: string, response?: import('express').Response, streamKeepAlive?: NodeJS.Timeout, [key: string]: any }|undefined}
     */
    getStore: () => storage.getStore(),

    /**
     * 生成指定前缀的 TraceId 并绑定至上下文中运行函数
     * @template T
     * @param {string} prefix - Trace 前缀
     * @param {() => T} fn - 待运行的函数
     * @returns {void}
     */
    runWithPrefix: (prefix, fn) => {
        const traceId = Tracer.generateTraceId(prefix);
        Tracer.run({ traceId }, fn);
    },

    /**
     * 向当前 Trace 上下文绑定的流式 Response 发送 SSE 格式事件消息（若尚未发送头部则自动初始化 SSE 头与心跳）
     * @param {any} message - 消息数据
     * @param {string} [event='message'] - 事件名称
     * @param {import('express').Response} [res] - 可选的指定 Response 实例（缺省时从 Trace 存储中读取）
     */
    tryStreamMessage: (message, event = 'message', res) => {
        const context = storage.getStore();
        res ??= context?.response;
        if (!res || res.destroyed || res.writableEnded) {
            return;
        }
        if (!res.headersSent) {
            res?.setHeader?.('X-Accel-Buffering', 'no');
            res?.setHeader?.('Content-Type', 'text/event-stream');
            res?.setHeader?.('Cache-Control', 'no-cache');
            res?.setHeader?.('Connection', 'keep-alive');
            res?.setHeader?.('Access-Control-Allow-Origin', '*');
            res?.flushHeaders?.();
            if (context) {
                context.streamKeepAlive = setInterval(() => {
                    __log.debug(`[Request Stream] Heartbeat.`);
                    res?.write?.(': keep-alive\n\n');
                }, 10000);
            }
        }
        res?.write(`event: ${event}\n`);
        const msgArr = resolveStreamMessage(message);
        for (const msg of msgArr) {
            res?.write(msg);
        }
    },

    /**
     * 清理当前上下文中的流式心跳定时器
     */
    clearStreamHeartbeat: () => {
        const context = storage.getStore();
        if (context?.streamKeepAlive) clearInterval(context?.streamKeepAlive);
    }
};