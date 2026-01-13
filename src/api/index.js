import express from 'express';
import cors from 'cors';
import http from 'http';
import { Executor } from '../common/executor.js';
import { importFolderScripts } from '../common/configUtil.js';
import { getRequestRealIp } from '../common/httpUtil.js';
import { getApiFilters } from '../filter/index.js'

let apiServer = null;

class ApiServer {
    #wsServer = null;
    #server = null;
    #serverConf = {
        port: 8082
    };
    #apiMapping = {};
    #apiFilters = [];

    constructor() {
        const server = __env.get('server')
        if (server) {
            this.#serverConf = {
                ...this.#serverConf,
                ...server
            };
        }
    }

    #doRequestFilters(resolve_0, reject_0, requestData) {
        new Executor(resolve_0, reject_0).submitAll(this.#apiFilters).start(requestData);
    }

    getWsServer() {
        return this.#wsServer;
    }

    getServer() {
        return this.#server;
    }

    addMapping(mapping) {
        if (this.#server || !mapping) {
            return;
        }
        let basePath = "";
        if (mapping.hasOwnProperty('basePath')) {
            basePath = mapping.basePath;
        }
        const apiDisabled = __env.get("api.apiDisabled", [])
        Object.keys(mapping).forEach(key => {
            if (key !== 'basePath' && key.startsWith("/") && apiDisabled.every(d => !new RegExp(d).test(basePath + key))) {
                this.#apiMapping[basePath + key] = mapping[key];
            }
        })
    }

    async start() {
        if (this.#server) {
            return Promise.resolve();
        }
        this.#apiFilters = await getApiFilters();
        const port = this.#serverConf.port;
        const server = express();
        if (this.#serverConf.cors) server.use(cors());
        const app = http.createServer(server);
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
            server[method](key, (req, res) => {
                __log.info(`[Request Access] [${methodFormat(req.method)}] ${req.url} From ${getRequestRealIp(req)}`);
                const requestData = { req, res, config };
                this.#doRequestFilters(() => {
                    try {
                        const cbResult = callback(req, res);
                        if (isPromise(cbResult)) {
                            cbResult.then(result => resolve(result, requestData))
                                .catch(err => reject(err, requestData))
                        } else {
                            resolve(cbResult, requestData);
                        }
                    } catch (err) {
                        reject(err, requestData);
                    }
                }, (err) => reject(err, requestData), requestData);
            })
            __log.info(`[Server] Request Mapping: [${methodFormat(method)}] ${key}`)
        }
        server.use((req, res) => {
            __log.info(`[Request Access] [${methodFormat(req.method)}] ${req.url} From ${getRequestRealIp(req)}`);
            reject({ code: -404, status: 404 }, { req, res });
        })
        __log.info(`[Server] Request Mapping: [ALL ] * -> 404 Not Found.`)
        return new Promise(resolve => {
            app.listen(port, () => {
                __log.info(`[Server] Started on port: ${port}.`);
                this.#server = server;
                this.#wsServer = app;
                resolve();
            });
        })
    }
}

const resolve = (obj, { req, res, config }) => {
    if (config?.ignoreReturn) {
        __log.info(`[Request Return] ${req.method}:${req.url}`)
        return;
    }
    const result = {
        code: 0,
        message: 'Success.'
    }
    if (obj) result.data = obj
    res.send(result);
    if (config?.ignoreOutput) {
        __log.info(`[Request Return] [${methodFormat(req.method)}] ${req.url}`)
    } else {
        __log.info(`[Request Return] [${methodFormat(req.method)}] ${req.url} ==> `, result);
    }
}

const reject = (ex, { req, res }) => {
    if (isError(ex)) error(`[Request Error] Message: ${ex.msg || ex.message} ${ex.error ? `Cause: ${ex.error.message}` : ''}`, ex);
    const resultObj = {
        code: ex?.code < 0 ? ex.code : -1,
        message: [-2, -3, -404].includes(ex?.code) ? "Bad Request." : (ex?.msg || "Server Error.")
    }
    let status = 200
    if (ex && 'status' in ex) {
        status = ex.status
    }
    res.status(status);
    res.send(resultObj);
    __log.info(`[Request Return] [${methodFormat(req.method)}] ${req.url} ==x ${status}:`, resultObj);
}

const methodFormat = (method) => {
    return ("" + method).toLocaleUpperCase().padEnd(4, " ");
}

export async function startServer() {
    if (apiServer !== null) return Promise.resolve();
    apiServer = new ApiServer();
    return importFolderScripts("@/src/api", true, mapping => {
        apiServer.addMapping(mapping.default)
    }).then(() => apiServer.start())
}

export function setupSocketChannels(channels) {
    const server = apiServer?.getServer() || null;
    const wsServer = apiServer?.getWsServer() || null;
    if (!server || !wsServer) return;
    const getChannel = (pathname) => {
        let result = null;
        channels.some(con => con.path === pathname && (result = con.server, true));
        return result;
    }
    wsServer.on('upgrade', (request, socket, head) => {
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