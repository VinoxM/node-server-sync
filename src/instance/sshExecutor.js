import { Client } from 'ssh2';

export class SSHExecutor {
    #config
    #conn
    #isReady = false
    #label
    #isDisconnecting = false
    #idleTimer = null;
    #idleTimeout;
    #onDestroy;

    constructor(config, label = 'Unknown', options = {}) {
        this.#config = {
            ...config,
            keepaliveInterval: 10000, // 每10秒发一次心跳
            keepaliveCountMax: 3,     // 心跳失败3次才断开
            readyTimeout: 20000       // 连接超时
        };
        this.#conn = new Client();
        this.#label = label

        this.#idleTimeout = options.idleTimeout ?? 300000;
        this.#onDestroy = options.onDestroy;
    }

    #resetIdleTimer() {
        if (this.#idleTimer) clearTimeout(this.#idleTimer);
        if (this.#isDisconnecting) return;

        this.#idleTimer = setTimeout(async () => {
            __log.log(`[${this.#label}] Idle timeout reached. Cleaning up...`);
            try {
                await this.disconnect();
                this.#onDestroy?.(this.#label);
            } catch (err) {
                __log.error(`[${this.#label}] Error during idle disconnect:`, err);
            }
        }, this.#idleTimeout);
    }

    async ensureConnection() {
        if (this.#isDisconnecting) {
            throw new Error(`[${this.#label}] Client is disconnecting or closed.`);
        }

        if (this.#isReady) return;

        return new Promise((resolve, reject) => {
            this.#conn.removeAllListeners();

            this.#conn
                .on('ready', () => {
                    this.#isReady = true;
                    __log.log(`[${this.#label}] SSH Connection Established.`);
                    this.#resetIdleTimer();
                    resolve();
                })
                .on('error', (err) => {
                    this.#isReady = false;
                    reject(err);
                })
                .on('close', () => {
                    this.#isReady = false;
                    __log.log(`[${this.#label}] SSH Connection Closed.`);
                })
                .connect(this.#config);
        });
    }

    async exec(scriptPath, args = [], options = {}) {
        await this.ensureConnection();

        if (this.#idleTimer) clearTimeout(this.#idleTimer);

        const safeArgs = args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ');
        const fullCmd = `${scriptPath} ${safeArgs}`;

        const onData = options.onData ?? (data => __log.log(data))

        return new Promise((resolve, reject) => {
            __log.log(`[${this.#label}] ------- Ready to execute command -----`);
            this.#conn.exec(fullCmd, (err, stream) => {
                if (err) return reject(err);

                let stdout = '';
                let stderr = '';

                stream.on('data', (data) => {
                    const chunk = data.toString();
                    stdout += chunk;
                    onData?.(chunk);
                });

                stream.stderr.on('data', (data) => {
                    const chunk = data.toString();
                    stderr += chunk;
                    onData?.(`[STDERR] ${chunk}`);
                });

                stream.on('close', (code) => {
                    __log.log(`[${this.#label}] ------- Execute command over ---------`)
                    resolve({ code, stdout, stderr });
                });
            });
        }).finally(() => this.#resetIdleTimer())
    }

    async disconnect() {
        if (this.#isDisconnecting) return;

        this.#isDisconnecting = true;

        if (this.#idleTimer) {
            clearTimeout(this.#idleTimer);
            this.#idleTimer = null
        }

        __log.log(`[${this.#label}] Disconnecting, blocking new commands...`);

        return new Promise((resolve) => {
            if (!this.#isReady) {
                resolve();
                return;
            }

            this.#conn.once('close', () => {
                this.#isReady = false;
                resolve();
            });

            this.#conn.end();
        });
    }
}