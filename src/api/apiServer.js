import express from 'express';
import cors from 'cors';
import http from 'http';
import { AsyncExecutor } from '#core/infra/asyncExecutor.js';
import { getRequestRealIp } from '#utils/requestUtil.js';
import { Tracer } from '#core/infra/tracer.js';

/**
 * @typedef {import('#types/routeTypes.d.ts').ApiRequest} ApiRequest
 * @typedef {import('#types/routeTypes.d.ts').ApiResponse} ApiResponse
 * @typedef {import('#types/routeTypes.d.ts').ApiRouteConfig} ApiRouteConfig
 * @typedef {import('#types/routeTypes.d.ts').ApiRouteModule} ApiRouteModule
 * @typedef {import('#types/filterTypes.d.ts').FilterExecuter} FilterExecuter
 */

/**
 * API 与 WebSocket HTTP 服务核心管理器 (单例模式)
 */
class ApiServer {
    /** @type {ApiServer} 单例实例 */
    static instance = new ApiServer();

    /** @type {boolean} 服务是否已成功启动就绪 */
    #ready = false;

    /** @type {http.Server|null} 承载 WebSocket upgrade 的原生 HTTP Server 实例 */
    #wsServer = null;

    /** @type {express.Express|null} 底层 Express 应用实例 */
    #server = null;

    /** @type {{ port: number, cors?: boolean, [key: string]: any }} 服务器运行配置参数 */
    #serverConf = {
        port: 8082
    };

    /** @type {RegExp[]} 禁用的 API 路径正则表达式列表 */
    #apiDisabled = [];

    /** @type {Record<string, ApiRouteConfig>} 完整路径到路由配置项的映射字典 */
    #apiMapping = {};

    /** @type {Array<FilterExecuter>} 全局请求过滤器 doFilter 列表 */
    #apiFilters = [];

    /** @type {Array<{ channel: string, path: string, server: import('ws').WebSocketServer }>} 已注册的 WebSocket 频道列表 */
    #wsChannels = [];

    constructor() {
    }

    /**
     * 初始化服务器配置（读取环境配置中的端口、跨域及禁用 API 规则）
     */
    initialize() {
        if (this.#server || this.#ready) return;
        const server = __env.get('server', {});
        this.#serverConf = {
            ...this.#serverConf,
            ...server
        };
        this.#apiDisabled = __env.get("api.apiDisabled", []).map(r => new RegExp(r));
    }

    /**
     * 获取服务器是否已经就绪/启动
     * @returns {boolean} 是否就绪
     */
    ready() {
        return this.#ready;
    }

    /**
     * 执行当前请求的过滤器执行管道 (基于 AsyncExecutor)
     * @param {() => Promise<void>|void} resolve_0 - 所有过滤器成功通过后的回调
     * @param {(err: any) => void} reject_0 - 过滤器中断或拒绝回调
     * @param {{ req: ApiRequest, res: ApiResponse, config: ApiRouteConfig }} requestData - 请求上下文数据
     */
    #doRequestFilters(resolve_0, reject_0, requestData) {
        new AsyncExecutor(resolve_0, reject_0).submitAll(this.#apiFilters).start(requestData);
    }

    /**
     * 注册全局请求过滤器列表
     * @param {Array<FilterExecuter>} apiFilters - 过滤器 doFilter 执行函数数组
     */
    addApiFilters(apiFilters) {
        if (this.#server || __isEmptyArray(apiFilters)) return;
        this.#apiFilters.push(...apiFilters);
    }

    /**
     * 注册路由映射模块配置
     * @param {ApiRouteModule} mapping - 路由配置模块
     */
    addApiMapping(mapping) {
        if (this.#server || !mapping) return;
        let basePath = mapping.basePath ?? '';
        Object.keys(mapping).forEach(key => {
            if (key !== 'basePath' && key.startsWith("/") && this.#apiDisabled.every(d => !d.test(basePath + key))) {
                this.#apiMapping[basePath + key] = mapping[key];
            }
        });
    }

    /**
     * 注册 WebSocket 频道配置列表
     * @param {Array<{ channel: string, path: string, server: import('ws').WebSocketServer }>} wsChannels - WebSocket 频道列表
     */
    addWsChannels(wsChannels) {
        if (this.#wsServer || __isEmptyArray(wsChannels)) return;
        this.#wsChannels.push(...wsChannels);
    }

    /**
     * 初始化 Express HTTP 服务实例、跨域中间件、路由分发与 Trace 链路追踪
     */
    #initApiServer() {
        const server = express();
        this.#serverConf.cors && server.use(cors());
        const methodSupport = ['get', 'post', 'all'];
        for (const key in this.#apiMapping) {
            const config = this.#apiMapping[key];
            const { method: m, callback, disabled, ignoreAccessPrint = false, pathRegex = false } = config;
            if (disabled) {
                continue;
            }
            const method = ("" + m).toLocaleLowerCase();
            if (!methodSupport.includes(method)) {
                continue;
            }
            const mappingKey = pathRegex ? new RegExp(key) : key;
            server[method](mappingKey, (req, res) => {
                const doRequest = () => {
                    ignoreAccessPrint || __log.info(`[Request Access] [${methodFormat(req.method)}] ${req.url} From ${getRequestRealIp(req)}`);
                    const requestData = { req, res, config };
                    this.#doRequestFilters(async () => {
                        try {
                            const cbResult = await callback(req, res);
                            resolve(cbResult, requestData);
                        } catch (err) {
                            reject(err, requestData);
                        }
                    }, (err) => reject(err, requestData), requestData);
                };
                if (config?.ignoreTrace) {
                    doRequest();
                } else {
                    const tracePrefix = generateRequestTracePrefix(method, req.url || key);
                    const traceId = Tracer.generateTraceId(tracePrefix);
                    if (config?.maybeStream) {
                        Tracer.run({ traceId, response: res }, doRequest);
                    } else {
                        Tracer.run({ traceId }, doRequest);
                    }
                }
            });
            __log.info(`[Server] Request Mapping: [${methodFormat(method)}] ${key}`);
        }
        server.use((req, res) => {
            __log.info(`[Request Access] [${methodFormat(req.method)}] ${req.url} From ${getRequestRealIp(req)}`);
            reject({ code: -404, status: 404 }, { req, res });
        });
        __log.info(`[Server] Request Mapping: [ALL ] * -> 404 Not Found.`);
        this.#server = server;
    }

    /**
     * 初始化 WebSocket 服务并挂载 HTTP Upgrade 协议升级路由分发
     */
    #initWebSocket() {
        const channels = this.#wsChannels;
        if (__isEmptyArray(channels)) return;
        this.#wsServer = http.createServer(this.#server);
        const getChannel = (pathname) => {
            let result = null;
            channels.some(con => con.path === pathname && (result = con.server, true));
            return result;
        };
        this.#wsServer.on('upgrade', (request, socket, head) => {
            const baseURL = request.protocol + '://' + request.headers.host + '/';
            const pathname = new URL(request.url, baseURL).pathname;
            const channel = getChannel(pathname);
            if (!channel) socket.destroy();
            channel.handleUpgrade(request, socket, head, (ws) => {
                channel.emit('connection', ws, request);
            });
        });
        channels.forEach(con => __log.info(`[Socket] Channel Mapping: [${con.channel}] ${con.path}`));
    }

    /**
     * 启动 API Server 并监听指定端口
     * @returns {Promise<void>}
     */
    async start() {
        if (this.#server) {
            return Promise.resolve();
        }
        this.#initApiServer();
        this.#initWebSocket();
        const port = this.#serverConf.port;
        const app = this.#wsServer ?? this.#server;
        return new Promise(resolve => {
            app.listen(port, () => {
                this.#ready = true;
                __log.info(`[Server] Started on port: ${port}.`);
                resolve();
            });
        });
    }
}

/**
 * 统一请求成功响应处理器（自动包装标准响应体、支持流式响应与打印控制）
 * @param {any} obj - 路由 callback 返回的业务数据
 * @param {{ req: ApiRequest, res: ApiResponse, config: ApiRouteConfig }} context - 请求上下文
 */
function resolve(obj, { req, res, config }) {
    Tracer.clearStreamHeartbeat();
    if (res.destroyed || res.writableEnded || config?.ignoreReturn || res.__customPiped) return;
    const result = {
        code: 0,
        message: 'Success.',
        data: undefined
    };
    if (obj !== undefined) result.data = obj;
    const printParams = [];
    if (res.headersSent) {
        Tracer.tryStreamMessage(result, 'done');
        res.end();
        printParams.push(`[Request StreamEnd]`);
    } else {
        res.send(result);
        printParams.push(`[Request Return]`);
    }
    printParams.push(`[${methodFormat(req.method)}]`, req.url);
    if (config?.printResponse) {
        printParams.push(`==>`, result);
    }
    config?.ignoreReturnPrint || __log.info(...printParams);
}

/**
 * 统一请求异常响应处理器（捕获错误状态码、格式化错误响应并记录日志）
 * @param {any} ex - 异常或抛出的错误对象
 * @param {{ req: ApiRequest, res: ApiResponse }} context - 请求上下文
 */
function reject(ex, { req, res }) {
    Tracer.clearStreamHeartbeat();
    if (__isError(ex)) __log.error(`[Request Error] Message: ${ex.msg || ex.message} ${ex.error ? `Cause: ${ex.error.message}` : ''}`, ex);
    const resultObj = {
        code: ex?.code < 0 ? ex.code : -1,
        message: [-2, -3, -404].includes(ex?.code) ? "Bad Request." : (ex?.msg || "Server Error.")
    };
    let status = 200;
    if (ex && typeof ex === 'object' && 'status' in ex) {
        status = ex.status;
    }
    if (res.destroyed || res.writableEnded) {
        __log.info(`[Request Destroyed] [${methodFormat(req.method)}] ${req.url} ==x `, resultObj);
    } else if (res.headersSent) {
        Tracer.tryStreamMessage(resultObj, 'done');
        res.end();
        __log.info(`[Request StreamEnd] [${methodFormat(req.method)}] ${req.url} ==x `, resultObj);
    } else {
        res.status(status);
        res.send(resultObj);
        __log.info(`[Request Return] [${methodFormat(req.method)}] ${req.url} ==x ${status}:`, resultObj);
    }
}

/**
 * 格式化 HTTP 请求方法名（大写并右对齐为 4 字符宽）
 * @param {string} method - HTTP 方法名
 * @returns {string} 格式化后的字符串 (如 'GET ', 'POST')
 */
function methodFormat(method) {
    return ("" + method).toLocaleUpperCase().padEnd(4, " ");
}

/**
 * 根据请求方法与 URL 生成全链路追踪 TraceId 前缀
 * @param {string} method - HTTP 方法
 * @param {string} url - 请求 URL
 * @returns {string} Trace 前缀字符串
 */
function generateRequestTracePrefix(method, url) {
    const urlUnique = (url + '').split('/').filter(__isNotBlank).map(s => s.substring(0, 1)).join('');
    return `REQ_${method.substring(0, 1)}_${urlUnique}`.toLocaleUpperCase();
}

/** API 服务单例实例 */
export const apiServer = ApiServer.instance;