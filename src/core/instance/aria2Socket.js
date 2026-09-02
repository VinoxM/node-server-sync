import WebSocket from 'ws';
import axios from 'axios';
import path from 'path';
import { ContextSubscribe } from '../context/subscribe.js';
import { generateUUID } from '#utils/cryptoUtil.js';

const ARIA2_METHOD = {
    ADD_URI: "aria2.addUri",
    TELL_STATUS: 'aria2.tellStatus',
    REMOVE: 'aria2.remove',
    MULTI_CALL: 'system.multicall',
    PAUSE: 'aria2.pause',
    RESUME: 'aria2.unpause'
};

/**
 * Aria2 RPC 客户端与 WebSocket 事件监听管理器 (单例模式)
 * 继承自 `ContextSubscribe`，支持配置热加载、断线重连、RPC 远程方法调用与下载事件回调分发
 */
class Aria2Socket extends ContextSubscribe {
    /** @type {Aria2Socket} 单例实例 */
    static instance = new Aria2Socket();

    /** @type {boolean} 是否已初始化配置 */
    #initialized = false;

    /** @type {boolean} WebSocket 连接是否已就绪 */
    #ready = false;

    /** @type {WebSocket|null} WebSocket 客户端实例 */
    #client = null;

    /** @type {string|null} Aria2 RPC 密钥 token */
    #secret = null;

    /** @type {string|null} 下载默认保存基础路径 */
    #savePath = null;

    /** @type {string|null} Aria2 WebSocket 连接地址 */
    #wsUrl = null;

    /** @type {string|null} Aria2 HTTP RPC 连接地址 */
    #rpcUrl = null;

    /** @type {boolean} 是否正在重连中 */
    #reconnecting = false;

    /** @type {number} 下次重连间隔秒数 (指数退避) */
    #nextConnectDelay = 5;

    /** @type {number} 最大重连间隔秒数 */
    #maxConnectDelay = 1024;

    /** @type {NodeJS.Timeout|null} 重连定时器 */
    #connectTimeout = null;

    /** @type {Map<string, (gid: string) => void>} 任务事件回调字典 (如 'onDownloadComplete' -> callback) */
    #taskCallback = new Map();

    constructor() {
        super('Aria2Socket', () => this.start(), true);
    }

    /**
     * 判断是否已初始化
     * @returns {boolean}
     */
    initialized() {
        return this.#initialized;
    }

    /**
     * 从全局配置读取 Aria2 RPC 参数并建立连接
     */
    start() {
        if (!this.#initialized) {
            this.doSubscribe();
            this.#initialized = true;
        }
        this.close(this.#client);
        const options = __env.get("aria2.rpc", {});
        const { host, port, secret, savePath } = options;
        if (!host || !port) return;
        this.#secret = secret;
        this.#savePath = savePath;
        if (parseInt(port) === 443) {
            this.#wsUrl = `wss://${host}:${port}/jsonrpc`;
            this.#rpcUrl = `https://${host}:${port}/jsonrpc`;
        } else {
            this.#wsUrl = `ws://${host}:${port}/jsonrpc`;
            this.#rpcUrl = `http://${host}:${port}/jsonrpc`;
        }
        this.#nextConnectDelay = 5;
        this.#connect();
    }

    /**
     * 建立 WebSocket 连接
     */
    #connect() {
        if (this.#ready) return;
        __log.debug(`[Aria2Socket] Prepare to connect: ${this.#wsUrl}`);
        const client = new WebSocket(this.#wsUrl);
        const instanceId = generateUUID();
        client.on('open', () => this.#onOpen(instanceId));
        client.on('message', data => this.#onMessage(data));
        client.on('error', e => this.#onError(e, client));
        client.on('close', () => this.#onClose(client, instanceId));
        this.#client = client;
    }

    /**
     * 指数退避重连机制
     */
    #reconnect() {
        if (this.#ready || this.#reconnecting) return;
        this.#reconnecting = true;
        if (this.#nextConnectDelay > this.#maxConnectDelay) {
            __log.warn(`[Aria2Socket] The maximum retry delay time: ${this.#maxConnectDelay} has been reached, retries will stop.`);
            this.#reconnecting = false;
            return;
        }
        this.#nextConnectDelay *= 2;
        __log.info(`[Aria2Socket] Prepare retry connect after ${this.#nextConnectDelay}s.`);
        this.#connectTimeout && clearTimeout(this.#connectTimeout);
        this.#connectTimeout = setTimeout(() => this.#connect(), this.#nextConnectDelay * 1000);
    }

    /**
     * 连接成功开启回调
     * @param {string} instanceId - 连接实例唯一 ID
     */
    #onOpen(instanceId) {
        __log.info(`[Aria2Socket] Aria2 connected. InstanceId: ${instanceId}`);
        this.#ready = true;
        this.#reconnecting = false;
        this.#nextConnectDelay = 5;
    }

    /**
     * 接收 Aria2 WebSocket 消息并分发通知事件
     * @param {import('ws').Data} data - 消息数据
     */
    #onMessage(data) {
        const payload = JSON.parse(data);
        if (payload.method && payload.method.startsWith('aria2.on')) {
            const eventName = payload.method.split('.')[1];
            const params = payload.params;
            const gid = params[0].gid;
            try {
                this.#taskCallback.get(eventName)?.(gid);
            } catch (e) {
                __log.error(`[Aria2Socket] Do event[${eventName}] callback error.`, e);
            }
        }
    }

    /**
     * 错误处理回调
     * @param {Error} e - 异常
     * @param {WebSocket} client - 当前 client
     */
    #onError(e, client) {
        __log.error('[Aria2Socket] Aria2 error.', e);
        this.close(client);
    }

    /**
     * 连接关闭回调
     * @param {WebSocket} client - 当前 client
     * @param {string} instanceId - 实例 ID
     */
    #onClose(client, instanceId) {
        __log.info(`[Aria2Socket] Aria2 closed. InstanceId: ${instanceId}`);
        if (this.#client === client) {
            this.#ready = false;
            this.#reconnecting = false;
            this.#reconnect();
        }
    }

    /**
     * 主动关闭连接并取消重连定时器
     * @param {WebSocket} [client] - 待关闭的 client 实例
     */
    close(client) {
        this.#ready = false;
        if (this.#client === client) {
            this.#client = null;
        }
        try {
            client?.close?.();
        } catch (e) {
            __log.error('[Aria2Socket] Aria2 close error.', e);
        }
        this.#connectTimeout && clearTimeout(this.#connectTimeout);
    }

    /**
     * 注册 Aria2 下载事件监听器 (如 'onDownloadComplete', 'onDownloadError' 等)
     * @param {string} event - 事件名 (去掉 'aria2.' 前缀)
     * @param {(gid: string) => void} callback - 触发回调函数
     */
    onEvent(event, callback) {
        if (__isFunction(callback)) {
            this.#taskCallback.set(event, callback);
        }
    }

    /**
     * 检查 Aria2 服务是否就绪
     * @throws {object} 未就绪时抛出异常
     */
    #checkReady() {
        this.#ready || __throwMessage('Aria2 not ready.');
    }

    /**
     * 执行单个 Aria2 JSON-RPC HTTP 请求
     * @param {string} method - RPC 方法名
     * @param {...any} options - 方法参数
     * @returns {Promise<any>}
     */
    async #call(method, ...options) {
        const requestData = {
            jsonrpc: '2.0',
            id: `node_${generateUUID()}`,
            method,
            params: [
                `token:${this.#secret}`,
                ...options
            ]
        };
        const { data } = await axios.post(this.#rpcUrl, requestData);
        if (data.error) {
            __log.error('RPC Error:', data.error.message);
            __throwMessage(data.error.message || 'Call aria2 error.');
        } else {
            return data.result;
        }
    }

    /**
     * 批量执行 Aria2 JSON-RPC 请求 (system.multicall)
     * @param {string} method - 批量调用的方法名
     * @param {...any} options - 各自的参数列表
     * @returns {Promise<any>}
     */
    async #multiCall(method, ...options) {
        const requestData = {
            jsonrpc: '2.0',
            id: `node_${generateUUID()}`,
            method: ARIA2_METHOD.MULTI_CALL,
            params: [
                options.map(opt => ({ methodName: method, params: [`token:${this.#secret}`, ...opt] }))
            ]
        };
        const { data } = await axios.post(this.#rpcUrl, requestData);
        if (data.error) {
            __log.error('RPC Error:', data.error.message);
            __throwMessage(data.error.message || 'Call aria2 error.');
        } else {
            return data.result;
        }
    }

    /**
     * 添加下载任务 (aria2.addUri)
     * @param {string} url - 下载资源链接 (HTTP / FTP / 磁力链接)
     * @param {Object} [opts={}] - 额外下载配置项 (如 dir, out 等)
     * @param {string} [opts.dir] - 子保存目录
     * @param {string} [opts.out] - 自定义保存文件名
     * @returns {Promise<string>} 返回生成的 GID
     */
    async addUri(url, opts = {}) {
        const { dir, out, ...otherOpts } = opts;
        this.#checkReady();
        const options = {
            dir: path.join(this.#savePath, dir || '')
        };
        if (__isNotBlank(out)) {
            options.out = out;
        }
        return this.#call(ARIA2_METHOD.ADD_URI, [url], { ...options, ...otherOpts });
    }

    /**
     * 获取下载任务详细状态 (aria2.tellStatus)
     * @param {string} gid - 任务 GID
     * @returns {Promise<{ gid: string, status: string, totalLength: string, completedLength: string, downloadSpeed: string, files: any[], dir: string }>}
     */
    async getInfo(gid) {
        return this.#call(ARIA2_METHOD.TELL_STATUS, gid, ["gid", "status", "totalLength", "completedLength", "downloadSpeed", "files", "dir"]);
    }

    /**
     * 暂停下载任务 (aria2.pause)
     * @param {string} gid - 任务 GID
     * @returns {Promise<string>}
     */
    async pause(gid) {
        return this.#call(ARIA2_METHOD.PAUSE, gid);
    }

    /**
     * 恢复下载任务 (aria2.unpause)
     * @param {string} gid - 任务 GID
     * @returns {Promise<string>}
     */
    async resume(gid) {
        return this.#call(ARIA2_METHOD.RESUME, gid);
    }

    /**
     * 移除下载任务 (aria2.remove)
     * @param {string} gid - 任务 GID
     * @returns {Promise<string>}
     */
    async remove(gid) {
        return this.#call(ARIA2_METHOD.REMOVE, gid);
    }

    /**
     * 批量获取多个任务的下载状态简报
     * @param {string[]} gidArr - GID 列表
     * @returns {Promise<Array<[{ gid: string, status: string, totalLength: string, completedLength: string }]> >}
     */
    async getMultiStatus(gidArr) {
        return this.#multiCall(ARIA2_METHOD.TELL_STATUS, ...gidArr.map(gid => ([gid, ["gid", "status", "totalLength", "completedLength"]])));
    }
}

/**
 * 确保 Aria2 客户端已启动初始化
 */
export function aria2SocketInitialize() {
    if (!Aria2Socket.instance.initialized()) {
        Aria2Socket.instance.start();
    }
}

/**
 * 获取全局 Aria2Socket 客户端单例实例
 * @returns {Aria2Socket}
 */
export function getAria2Socket() {
    aria2SocketInitialize();
    return Aria2Socket.instance;
}