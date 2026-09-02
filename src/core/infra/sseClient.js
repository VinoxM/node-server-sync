import { getRequestRealIp, resolveStreamMessage } from '#utils/requestUtil.js';
import { ContextSubscribe } from '../context/subscribe.js';

/**
 * Server-Sent Events (SSE) 服务端推送客户端连接会话
 * 继承自 `ContextSubscribe`，支持配置热刷新联动、心跳保活、过滤写入校验与事件推送
 */
export class SSEClient extends ContextSubscribe {
    /** @type {string} 客户端真实 IP 地址 */
    #realIp;

    /** @type {string} 连接用户名（取自 query.uname 或默认为 'default'） */
    #uname;

    /** @type {import('express').Request} 原生 HTTP Request 实例 */
    #request;

    /** @type {import('express').Response} 原生 HTTP Response 实例 */
    #response;

    /** @type {(() => void)|null} 连接关闭完成回调函数 */
    #onClosed = null;

    /** @type {NodeJS.Timeout|null} SSE 心跳定时器 (30s) */
    #keepalive = null;

    /** @type {((client: SSEClient, query: any) => void)|null} 建立连接成功回调 */
    #onConnected = null;

    /** @type {(() => void)|null} 断开连接回调 */
    #onDisconnected = null;

    /** @type {(query: any, opts: any, client: SSEClient) => boolean} 写入权限/过滤校验判断函数 */
    #canWrite = () => true;

    /**
     * @param {import('express').Request} request - HTTP Request
     * @param {import('express').Response} response - HTTP Response
     * @param {Object} [options={}] - 配置选项
     * @param {string} options.channel - SSE 频道名称
     * @param {(client: SSEClient, query: any) => void} [options.onConnected] - 客户端成功连接回调
     * @param {(client: SSEClient) => void} [options.onConfigurationRefreshed] - 全局配置刷新联动回调
     * @param {() => void} [options.onDisconnected] - 客户端断开连接回调
     * @param {(query: any, opts: any, client: SSEClient) => boolean} [options.canWrite] - 事件写入判定函数
     */
    constructor(request, response, options = {}) {
        const {
            channel,
            onConnected = null,
            onConfigurationRefreshed = null,
            onDisconnected = null,
            canWrite
        } = options;
        super(`SSE-${channel}`, () => onConfigurationRefreshed?.(this));
        if (typeof canWrite === 'function') this.#canWrite = canWrite;
        this.#request = request;
        this.#response = response;
        this.#onConnected = onConnected;
        this.#onDisconnected = onDisconnected;
        this.#initialize();
    }

    /**
     * 初始化 SSE 响应头、心跳定时器并绑定断开监听
     */
    #initialize() {
        this.#realIp = getRequestRealIp(this.#request);
        this.#uname = this.#request.query?.uname ?? 'default';
        this.#response?.setHeader('Content-Type', 'text/event-stream');
        this.#response?.setHeader('Cache-Control', 'no-cache');
        this.#response?.setHeader('Connection', 'keep-alive');
        this.#response?.setHeader('Access-Control-Allow-Origin', '*');
        this.#response?.setHeader('X-Accel-Buffering', 'no');
        this.#response?.flushHeaders?.();
        this.#setupKeepalive();
        this.#request?.on?.('close', () => {
            this.close();
        });
        this.emitEvent('connect', '');
        if (__isFunction(this.#onConnected)) {
            this.#onConnected(this, this.#request.query);
        }
    }

    /**
     * 启动 30 秒 SSE 协议心跳包定时发送
     */
    #setupKeepalive() {
        this.#clearKeepalive();
        this.#keepalive = setInterval(() => {
            this.#response?.write(': keep-alive\n\n');
        }, 30000);
    }

    /**
     * 清除心跳定时器
     */
    #clearKeepalive() {
        if (this.#keepalive !== null) {
            clearInterval(this.#keepalive);
            this.#keepalive = null;
        }
    }

    /**
     * 获取客户端真实 IP 地址
     * @returns {string}
     */
    getRealIp() {
        return this.#realIp;
    }

    /**
     * 获取连接用户名
     * @returns {string}
     */
    getUname() {
        return this.#uname;
    }

    /**
     * 设置连接关闭时的回调
     * @param {() => void} func - 回调函数
     */
    setupOnClosed(func) {
        this.#onClosed = func;
    }

    /**
     * 向当前 SSE 客户端发送纯数据消息 (默认无 event 字段)
     * @param {any} message - 待发送的数据内容
     */
    sendMessage(message) {
        const msgArr = resolveStreamMessage(message);
        for (const msg of msgArr) {
            this.#response?.write(msg);
        }
    }

    /**
     * 向当前 SSE 客户端发送带事件类型的消息
     * @param {string} event - 事件类型名 (如 'connect', 'message', 'update')
     * @param {any} message - 消息数据
     * @param {any} [opts] - 透传给 canWrite 的选项参数
     */
    emitEvent(event, message, opts) {
        if (opts !== undefined && (!this.#canWrite || !this.#canWrite(this.#request.query, opts, this))) {
            return;
        }
        this.#response?.write(`event: ${event}\n`);
        const msgArr = resolveStreamMessage(message);
        for (const msg of msgArr) {
            this.#response?.write(msg);
        }
    }

    /**
     * 关闭 SSE 响应流并清理资源与订阅
     */
    close() {
        this.destroy();
        this.#clearKeepalive();
        try {
            this.#response?.end?.();
            if (__isFunction(this.#onClosed)) {
                this.#onClosed();
            }
            if (__isFunction(this.#onDisconnected)) {
                this.#onDisconnected();
            }
        } catch (ignored) {
            __log.error(ignored);
        }
    }
}