import express from 'express';
import cors from 'cors';
import http from 'http';
import { AsyncExecutor } from '../core/infra/asyncExecutor.js';
import { getRequestRealIp } from '../common/utils/requestUtil.js';
import { Tracer } from '../core/infra/tracer.js';

class ApiServer {
    static instance = new ApiServer();

    #ready = false;
    #wsServer = null;
    #server = null;
    #serverConf = {
        port: 8082
    };
    #apiDisabled = [];
    #apiMapping = {};
    #apiFilters = [];
    #wsChannels = [];

    constructor() {
    }

    initialize() {
        if (this.#server || this.#ready) return;
        const server = __env.get('server', {})
        this.#serverConf = {
            ...this.#serverConf,
            ...server
        }
        this.#apiDisabled = __env.get("api.apiDisabled", []).map(r => new RegExp(r))
    }

    ready() {
        return this.#ready
    }

    #doRequestFilters(resolve_0, reject_0, requestData) {
        new AsyncExecutor(resolve_0, reject_0).submitAll(this.#apiFilters).start(requestData);
    }

    addApiFilters(apiFilters) {
        if (this.#server || __isEmptyArray(apiFilters)) return;
        this.#apiFilters = apiFilters
    }

    addApiMapping(mapping) {
        if (this.#server || !mapping) return;
        let basePath = "";
        if (mapping.hasOwnProperty('basePath')) {
            basePath = mapping.basePath;
        }
        Object.keys(mapping).forEach(key => {
            if (key !== 'basePath' && key.startsWith("/") && this.#apiDisabled.every(d => !d.test(basePath + key))) {
                this.#apiMapping[basePath + key] = mapping[key];
            }
        })
    }

    addWsChannels(wsChannels) {
        if (this.#wsServer || __isEmptyArray(wsChannels)) return;
        this.#wsChannels = wsChannels;
    }

    #initApiServer() {
        const server = express();
        this.#serverConf.cors && server.use(cors());
        const methodSupport = ['get', 'post', 'all'];
        for (const key in this.#apiMapping) {
            const config = this.#apiMapping[key];
            const { method: m, callback, disabled } = config;
            if (disabled) {
                continue;
            }
            const method = m ? (m + "").toLocaleLowerCase() : "all";
            if (methodSupport.indexOf(method) === -1) {
                continue;
            }
            const tracePrefix = generateRequestTracePrefix(method, key)
            server[method](key, (req, res) => {
                const doRequest = () => {
                    __log.info(`[Request Access] [${methodFormat(req.method)}] ${req.url} From ${getRequestRealIp(req)}`);
                    const requestData = { req, res, config };
                    this.#doRequestFilters(async () => {
                        try {
                            const cbResult = await callback(req, res)
                            resolve(cbResult, requestData)
                        } catch (err) {
                            reject(err, requestData);
                        }
                    }, (err) => reject(err, requestData), requestData);
                }
                if (config?.ignoreTrace) {
                    doRequest()
                } else {
                    const traceId = Tracer.generateTraceId(tracePrefix)
                    if (config?.maybeStream) {
                        Tracer.run({ traceId, response: res }, doRequest)
                    } else {
                        Tracer.run({ traceId }, doRequest)
                    }
                }
            })
            __log.info(`[Server] Request Mapping: [${methodFormat(method)}] ${key}`)
        }
        server.use((req, res) => {
            __log.info(`[Request Access] [${methodFormat(req.method)}] ${req.url} From ${getRequestRealIp(req)}`);
            reject({ code: -404, status: 404 }, { req, res });
        })
        __log.info(`[Server] Request Mapping: [ALL ] * -> 404 Not Found.`)
        this.#server = server;
    }

    #initWebSocket() {
        const channels = this.#wsChannels
        if (__isEmptyArray(channels)) return;
        this.#wsServer = http.createServer(this.#server);
        const getChannel = (pathname) => {
            let result = null;
            channels.some(con => con.path === pathname && (result = con.server, true));
            return result;
        }
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
                this.#ready = true
                __log.info(`[Server] Started on port: ${port}.`);
                resolve();
            });
        })
    }
}

function resolve(obj, { req, res, config }) {
    Tracer.clearStreamHeartbeat();
    if (res.destroyed || res.writableEnded || config?.ignoreReturn) return;
    const result = {
        code: 0,
        message: 'Success.'
    }
    if (obj !== undefined) result.data = obj
    const printParams = []
    if (res.headersSent) {
        Tracer.tryStreamMessage(result, 'done')
        res.end();
        printParams.push(`[Request StreamEnd]`)
    } else {
        res.send(result);
        printParams.push(`[Request Return]`)
    }
    printParams.push(`[${methodFormat(req.method)}]`, req.url)
    if (config?.printResponse) {
        printParams.push(`==>`, result)
    }
    __log.info(...printParams);
}

function reject(ex, { req, res }) {
    Tracer.clearStreamHeartbeat();
    if (__isError(ex)) __log.error(`[Request Error] Message: ${ex.msg || ex.message} ${ex.error ? `Cause: ${ex.error.message}` : ''}`, ex);
    const resultObj = {
        code: ex?.code < 0 ? ex.code : -1,
        message: [-2, -3, -404].includes(ex?.code) ? "Bad Request." : (ex?.msg || "Server Error.")
    }
    let status = 200
    if (ex && typeof ex === 'object' && 'status' in ex) {
        status = ex.status
    }
    if (res.destroyed || res.writableEnded) {
        __log.info(`[Request Destroyed] [${methodFormat(req.method)}] ${req.url} ==x `, resultObj);
    } else if (res.headersSent) {
        Tracer.tryStreamMessage(resultObj, 'done')
        res.end();
        __log.info(`[Request StreamEnd] [${methodFormat(req.method)}] ${req.url} ==x `, resultObj);
    } else {
        res.status(status);
        res.send(resultObj);
        __log.info(`[Request Return] [${methodFormat(req.method)}] ${req.url} ==x ${status}:`, resultObj);
    }
}

function methodFormat(method) {
    return ("" + method).toLocaleUpperCase().padEnd(4, " ");
}

function generateRequestTracePrefix(method, url) {
    const urlUnique = (url + '').split('/').filter(__isNotBlank).map(s => s.substring(0, 1)).join('')
    return `REQ_${method.substring(0, 1)}_${urlUnique}`.toLocaleUpperCase()
}

export const apiServer = ApiServer.instance;