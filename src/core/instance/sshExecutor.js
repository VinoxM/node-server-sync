import { Client } from 'ssh2';
import { Tracer } from '../infra/tracer.js';
import { broadcastSSE } from '#modules/socket/sseStorage.js';

const TASK_DESCRIPTION_DEFAULT_VALUE = {
    title: 'Unknown Task',
    desc: 'Unknown Task Description'
};
const SSE_LABEL = 'executor';

/**
 * SSH 执行器 SSE 事件名称常量枚举
 */
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
};

/**
 * 远程 SSH 脚本与命令串行执行器
 * 支持连接保活、断线重连、串行队列排队、空闲超时自动断开及全流程 SSE 实时日志广播
 */
class SSHExecutor {
    /** @type {import('ssh2').ConnectConfig} SSH 连接配置参数 */
    #config;

    /** @type {Client} ssh2 Client 实例 */
    #conn;

    /** @type {boolean} 连接是否已就绪 */
    #isReady = false;

    /** @type {string} 实例标识名称 (如 'remote-node-1') */
    #label;

    /** @type {boolean} 是否正在断开连接中 */
    #isDisconnecting = false;

    /** @type {NodeJS.Timeout|null} 空闲超时定时器 */
    #idleTimer = null;

    /** @type {number} 空闲最大等待时间 (毫秒，超时后自动断开释放连接) */
    #idleTimeout;

    /** @type {((label: string) => void)|undefined} 实例销毁清理回调 */
    #onDestroy;

    // 串行队列管理
    /** @type {Promise<any>} 内部串行 Promise 链 */
    #queue = Promise.resolve();

    /** @type {number} 当前在排队中的待执行任务数 */
    #pendingCount = 0;

    /** @type {Array<{ title: string, desc: string }>} 待执行任务描述信息列表 */
    #tasksDesc = [];

    /** @type {{ title?: string, desc?: string, std: Array<{ chunk: string, isError: boolean }>, ended: boolean }|null} 当前运行任务快照 */
    #taskSnapshot = {
        desc: 'Unknown',
        std: [],
        ended: true
    };

    /**
     * @param {import('ssh2').ConnectConfig} config - SSH 连接配置 (host, port, username, password 等)
     * @param {string} [label='Unknown'] - 实例名称
     * @param {Object} [options={}] - 配置选项
     * @param {number} [options.idleTimeout=300000] - 空闲超时自动断开时间 (毫秒)
     * @param {(label: string) => void} [options.onDestroy] - 销毁回调
     */
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
     * 向 SSE 广播对应事件与消息
     * @param {string} event - 事件名
     * @param {any} [message=''] - 消息内容
     */
    #emit(event, message = '') {
        const messageObj = { message, timestamp: Date.now() };
        broadcastSSE(SSE_LABEL, event, messageObj, { label: this.#label });
    }

    /**
     * 记录普通日志并广播 SSE
     * @param {string} message - 日志消息
     */
    #logMessage(message) {
        __log.info(message);
        this.#emit(SSE_EVENT.MESSAGE, message);
    }

    /**
     * 记录错误日志并广播 SSE
     * @param {string} message - 错误消息
     */
    #errorMessage(message) {
        __log.error(message);
        this.#emit(SSE_EVENT.ERROR, message);
    }

    /**
     * 初始化 SSH 客户端并绑定事件监听器
     */
    #initClient() {
        this.#conn = new Client();

        this.#conn.on('ready', () => {
            this.#isReady = true;
            this.#emit(SSE_EVENT.READY);
            this.#logMessage(`[${this.#label}] SSH Connection Established.`);
        });

        this.#conn.on('close', () => {
            this.#isReady = false;
            this.#logMessage(`[${this.#label}] SSH Connection Closed.`);
        });

        this.#conn.on('error', (err) => {
            this.#isReady = false;
            this.#errorMessage(`[${this.#label}] SSH Error: ${err.message}`);
        });
    }

    /**
     * 记录新增任务描述
     * @param {{ title?: string, desc?: string }} [options={}]
     */
    #putTaskDesc(options = {}) {
        const title = options.title ?? TASK_DESCRIPTION_DEFAULT_VALUE.title;
        const desc = options.desc ?? TASK_DESCRIPTION_DEFAULT_VALUE.desc;
        this.#tasksDesc.push({ title, desc });
    }

    /**
     * 查看当前队首任务描述
     * @returns {{ title: string, desc: string }|undefined}
     */
    #peekTaskDesc() {
        return this.#tasksDesc[0];
    }

    /**
     * 弹出当前执行完毕的任务描述
     * @returns {{ title: string, desc: string }|undefined}
     */
    #popTaskDesc() {
        return this.#tasksDesc.shift();
    }

    /**
     * 初始化当前任务快照记录
     * @param {{ title?: string, desc?: string }} [taskDesc={}]
     */
    #initTaskSnapshot(taskDesc = {}) {
        this.#taskSnapshot = {
            title: taskDesc.title || TASK_DESCRIPTION_DEFAULT_VALUE.title,
            desc: taskDesc.desc || TASK_DESCRIPTION_DEFAULT_VALUE.desc,
            std: [],
            ended: false
        };
    }

    /**
     * 获取当前执行器与排队任务的运行快照状态
     * @returns {{ ready: boolean, pendingCount: number, taskSnapshot: object|null, tasksDesc: Array<{ title: string, desc: string }> }}
     */
    getCurrentTaskSnapshot() {
        return {
            ready: this.#isReady,
            pendingCount: this.#pendingCount,
            taskSnapshot: this.#taskSnapshot,
            tasksDesc: this.#tasksDesc
        };
    }

    /**
     * 重置空闲定时器，无任务时超时自动断开
     */
    #resetIdleTimer() {
        if (this.#idleTimer) clearTimeout(this.#idleTimer);
        if (this.#isDisconnecting || this.#pendingCount > 0) return;

        Tracer.runClearly(() => {
            this.#idleTimer = setTimeout(async () => {
                this.#logMessage(`[${this.#label}] Idle timeout reached (${this.#idleTimeout}ms). Cleaning up...`);
                try {
                    await this.disconnect();
                    this.#onDestroy?.(this.#label);
                } catch (err) {
                    this.#errorMessage(`[${this.#label}] Error during idle disconnect: ${err.message}`);
                }
            }, this.#idleTimeout);
        });
    }

    /**
     * 确保 SSH 连接可用（断开时自动发起连接）
     * @returns {Promise<void>}
     */
    async ensureConnection() {
        if (this.#isDisconnecting) throw new Error(`[${this.#label}] Client is disconnecting.`);
        if (this.#isReady) return;

        return new Promise((resolve, reject) => {
            this.#conn.once('ready', resolve);
            this.#conn.once('error', reject);

            this.#logMessage(`[${this.#label}] Connecting to host...`);
            this.#conn.connect(this.#config);
        });
    }

    /**
     * 提交并串行执行远程脚本/命令
     * @param {string} scriptPath - 脚本路径或命令
     * @param {Array<string|number>} [args=[]] - 参数列表 (会自动进行 Shell 安全转义)
     * @param {Object} [options={}] - 配置选项
     * @param {string} [options.title] - 任务标题
     * @param {string} [options.desc] - 任务描述
     * @param {(data: string) => void} [options.onData] - 实时标准输出回调
     * @returns {Promise<{ code: number, stdout: string, stderr: string }>} 执行退出码与输出内容
     */
    async exec(scriptPath, args = [], options = {}) {
        this.#pendingCount++;
        this.#putTaskDesc(options);
        this.#emit(SSE_EVENT.PENDING_UPDATE, this.#tasksDesc);
        this.#logMessage(`[${this.#label}] Task queued. Queue size: ${this.#pendingCount}`);

        this.#queue = this.#queue.then(async () => {
            const taskDesc = this.#peekTaskDesc();
            this.#initTaskSnapshot(taskDesc);
            this.#logMessage(`[${this.#label}] Execution started. Queue depth: ${this.#pendingCount}`);
            this.#emit(SSE_EVENT.EXEC_START, taskDesc?.desc || 'Unknown');

            try {
                return await this.#internalExec(scriptPath, args, options);
            } finally {
                this.#pendingCount--;
                this.#popTaskDesc();
                this.#emit(SSE_EVENT.EXEC_END, taskDesc?.desc || 'Unknown');
                this.#emit(SSE_EVENT.PENDING_UPDATE, this.#tasksDesc);
                if (this.#taskSnapshot) this.#taskSnapshot.ended = true;
                this.#logMessage(`[${this.#label}] Execution finished. Remaining: ${this.#pendingCount}`);
                this.#resetIdleTimer();
            }
        }).catch(err => {
            this.#errorMessage(`[${this.#label}] Execution failed: ${err.message}`);
            throw err;
        });

        return this.#queue;
    }

    /**
     * 内部执行 SSH 命令与流式日志输出收集
     * @param {string} scriptPath
     * @param {Array<string|number>} args
     * @param {Object} options
     * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
     */
    async #internalExec(scriptPath, args, options) {
        await this.ensureConnection();

        if (this.#idleTimer) {
            clearTimeout(this.#idleTimer);
            this.#idleTimer = null;
        }

        const safeArgs = args.map(arg => `'${String(arg).replace(/'/g, "'\\''")}'`).join(' ');
        const fullCmd = `${scriptPath} ${safeArgs}`;
        const onData = options.onData ?? (data => __log.print(data));

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                this.#conn.removeListener('close', onConnClose);
            };

            const snapshotStd = (chunk, isError = false) => {
                this.#taskSnapshot?.std.push({ chunk, isError });
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
                    this.#emit(SSE_EVENT.STDOUT, chunk);
                });

                stream.stderr.on('data', (data) => {
                    const chunk = data.toString();
                    stderr += chunk;
                    onData?.(`[STDERR] ${chunk}`);
                    snapshotStd(chunk, true);
                    this.#emit(SSE_EVENT.STDERR, chunk);
                });

                stream.on('close', (code) => {
                    cleanup();
                    resolve({ code, stdout, stderr });
                });
            });
        });
    }

    /**
     * 主动断开 SSH 连接
     * @returns {Promise<void>}
     */
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

/** @type {Map<string, SSHExecutor>} SSH 执行器连接池 */
const sshExecutorPool = new Map();

/**
 * 根据标签从连接池获取或创建 SSHExecutor 实例
 * @param {string} [label=''] - SSH 连接配置标签 (对应配置中的 `ssh.<label>`)
 * @returns {import('#types/sshTypes.d.ts').ISSHExecutor|null}
 */
export function getSSHExecutor(label = '') {
    if (!label) return null;
    if (sshExecutorPool.has(label)) {
        return sshExecutorPool.get(label);
    }
    const configKey = `ssh.${label}`;
    const sshConfig = __env.get(configKey);
    if (!sshConfig) return null;
    const executor = new SSHExecutor(sshConfig, label, {
        idleTimeout: 300000,
        onDestroy: (lbl) => {
            if (sshExecutorPool.has(lbl)) {
                sshExecutorPool.delete(lbl);
                const message = `[${lbl}] Pool auto-cleanup: entry removed.`;
                __log.info(message);
                broadcastSSE(SSE_LABEL, SSE_EVENT.MESSAGE, { message, timestamp: Date.now() }, { label });
                broadcastSSE(SSE_LABEL, SSE_EVENT.DESTROY, { timestamp: Date.now() }, { label });
            }
        }
    });
    sshExecutorPool.set(label, executor);
    return executor;
}

/**
 * 获取指定标签的 SSH 执行器运行快照
 * @param {string} [label=''] - 标签名称
 * @returns {object} 执行快照对象
 */
export function getExecutorSnapshot(label = '') {
    return sshExecutorPool.get(label)?.getCurrentTaskSnapshot?.() || { ready: false };
}