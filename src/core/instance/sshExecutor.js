import { Client } from 'ssh2';
import { Tracer } from '../infra/tracer.js';
import { broadcastSSE } from '../../modules/socket/sseStorage.js';

const SSE_LABEL = 'executor';
export const SSE_EVENT = {
    MESSAGE: 'message',
    ERROR: 'error',
    STDOUT: 'stdout',
    STDERR: 'stderr',
    READY: 'ready',
    DESTROY: 'destroy',
    PENDING_UPDATE: 'pending-update',
    EXEC_START: 'exec-start',
    EXEC_END: 'exec-end'
}

const emit = (message, event) => broadcastSSE(SSE_LABEL, event, message)

function logMessage(message) {
    __log.info(message)
    emit(SSE_EVENT.MESSAGE, message)
}

function errorMessage(message) {
    __log.error(message)
    emit(SSE_EVENT.ERROR, message)
}

class SSHExecutor {
    #config;
    #conn;
    #isReady = false;
    #label;
    #isDisconnecting = false;
    #idleTimer = null;
    #idleTimeout;
    #onDestroy;

    // 串行队列管理
    #queue = Promise.resolve();
    #pendingCount = 0;

    #taskSnapshot = {
        desc: 'Unknown',
        std: []
    };

    constructor(config, label = 'Unknown', options = {}) {
        this.#config = {
            ...config,
            keepaliveInterval: 10000,
            keepaliveCountMax: 3,
            readyTimeout: 20000
        };
        this.#label = label;
        this.#idleTimeout = options.idleTimeout ?? 300000;
        this.#onDestroy = options.onDestroy;

        this.#initClient();
    }

    /**
     * 初始化 SSH 客户端并绑定全局唯一监听器
     */
    #initClient() {
        this.#conn = new Client();

        this.#conn.on('ready', () => {
            this.#isReady = true;
            emit(SSE_EVENT.READY);
            logMessage(`[${this.#label}] SSH Connection Established.`);
        });

        this.#conn.on('close', () => {
            this.#isReady = false;
            logMessage(`[${this.#label}] SSH Connection Closed.`);
            // 如果不是主动断开，且队列中还有任务，下个任务执行时会自动重连
        });

        this.#conn.on('error', (err) => {
            this.#isReady = false;
            errorMessage(`[${this.#label}] SSH Error:`, err.message);
        });
    }

    #initTaskSnapshot(options = {}) {
        this.#taskSnapshot = {
            desc: options.desc || 'Unknown',
            std: []
        }
    }

    getCurrentTaskSnapshot() {
        return {
            ready: this.#isReady,
            pendingCount: this.#pendingCount,
            taskSnapshot: this.#taskSnapshot
        }
    }

    #resetIdleTimer() {
        if (this.#idleTimer) clearTimeout(this.#idleTimer);
        if (this.#isDisconnecting || this.#pendingCount > 0) return;

        Tracer.runClearly(() => {
            this.#idleTimer = setTimeout(async () => {
                logMessage(`[${this.#label}] Idle timeout reached (${this.#idleTimeout}ms). Cleaning up...`);
                try {
                    await this.disconnect();
                    this.#onDestroy?.(this.#label);
                } catch (err) {
                    errorMessage(`[${this.#label}] Error during idle disconnect: ${err.message}`,);
                }
            }, this.#idleTimeout);
        })
    }

    /**
     * 确保连接可用，支持并发调用时的重连竞争
     */
    async ensureConnection() {
        if (this.#isDisconnecting) throw new Error(`[${this.#label}] Client is disconnecting.`);
        if (this.#isReady) return;

        return new Promise((resolve, reject) => {
            // 只为本次 connect 动作绑定一次性回调
            this.#conn.once('ready', resolve);
            this.#conn.once('error', reject);

            logMessage(`[${this.#label}] Connecting to host...`);
            this.#conn.connect(this.#config);
        });
    }

    /**
     * 公开执行接口：串行化任务
     */
    async exec(scriptPath, args = [], options = {}) {
        emit(SSE_EVENT.PENDING_UPDATE, ++this.#pendingCount);
        logMessage(`[${this.#label}] Task queued. Queue size: ${this.#pendingCount}`);

        // 核心逻辑：通过不断的 .then 形成 Promise 链条
        this.#queue = this.#queue.then(async () => {
            this.#initTaskSnapshot(options)
            emit(SSE_EVENT.EXEC_START, options.desc || 'Unknown')
            logMessage(`[${this.#label}] Execution started. Queue depth: ${this.#pendingCount}`);

            try {
                return await this.#internalExec(scriptPath, args, options);
            } finally {
                emit(SSE_EVENT.EXEC_END, options.desc || 'Unknown')
                emit(SSE_EVENT.PENDING_UPDATE, --this.#pendingCount);
                logMessage(`[${this.#label}] Execution finished. Remaining: ${this.#pendingCount}`);
                this.#resetIdleTimer();
            }
        }).catch(err => {
            // 捕获任务错误，防止中断整个 Promise 链
            errorMessage(`[${this.#label}] Execution failed: ${err.message}`);
            throw err;
        });

        return this.#queue;
    }

    /**
     * 内部执行逻辑
     */
    async #internalExec(scriptPath, args, options) {
        await this.ensureConnection();

        if (this.#idleTimer) {
            clearTimeout(this.#idleTimer);
            this.#idleTimer = null;
        }

        const safeArgs = args.map(arg => `"${String(arg).replace(/"/g, '\\"')}"`).join(' ');
        const fullCmd = `${scriptPath} ${safeArgs}`;
        const onData = options.onData ?? (data => __log.print(data));

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                this.#conn.removeListener('close', onConnClose);
            };

            const snapshotStd = (chunk, isError = false) => {
                this.#taskSnapshot.std.push({ chunk, isError })
            };

            const onConnClose = () => reject(new Error('Connection lost during execution'));
            this.#conn.once('close', onConnClose);

            this.#conn.exec(fullCmd, (err, stream) => {
                if (err) {
                    cleanup();
                    return reject(err);
                }

                let stdout = '';
                let stderr = '';

                stream.on('data', (data) => {
                    const chunk = data.toString();
                    stdout += chunk;
                    onData?.(chunk);
                    snapshotStd(chunk);
                    emit(SSE_EVENT.STDOUT, chunk);
                });

                stream.stderr.on('data', (data) => {
                    const chunk = data.toString();
                    stderr += chunk;
                    onData?.(`[STDERR] ${chunk}`);
                    snapshotStd(chunk, true);
                    emit(SSE_EVENT.STDERR, chunk);
                });

                stream.on('close', (code) => {
                    cleanup(); // 任务完成，移除监听器
                    resolve({ code, stdout, stderr });
                });
            });
        });
    }

    async disconnect() {
        if (this.#isDisconnecting) return;
        this.#isDisconnecting = true;

        if (this.#idleTimer) {
            clearTimeout(this.#idleTimer);
            this.#idleTimer = null;
        }

        return new Promise((resolve) => {
            if (!this.#isReady) {
                this.#isDisconnecting = false;
                resolve();
                return;
            }

            this.#conn.once('close', () => {
                this.#isReady = false;
                this.#isDisconnecting = false;
                this.#taskSnapshot = null;
                resolve();
            });

            this.#conn.end();
        });
    }
}

const sshExecutorPool = new Map()

export function getSSHExecutor(label = '') {
    if (!label) return null
    if (sshExecutorPool.has(label)) {
        return sshExecutorPool.get(label)
    }
    const configKey = `ssh.${label}`
    const sshConfig = __env.get(configKey)
    if (!sshConfig) return null
    const executor = new SSHExecutor(sshConfig, label, {
        idleTimeout: 300000,
        onDestroy: (lbl) => {
            if (sshExecutorPool.has(lbl)) {
                sshExecutorPool.delete(lbl);
                logMessage(`[${lbl}] Pool auto-cleanup: entry removed.`);
                emit(SSE_EVENT.DESTROY)
            }
        }
    })
    sshExecutorPool.set(label, executor)
    return executor
}

export function getExecutorSnapshot(label = '') {
    return sshExecutorPool.get(label)?.getCurrentTaskSnapshot?.() || { ready: false }
}