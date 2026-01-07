import path from 'path'
import fs from 'fs'
import { Worker } from 'worker_threads'

const workerOptions = {
    maxFileSize: 1 * 1024 * 1024,
    maxFiles: 5,
    flushInterval: 2000
}

export class LogWorker {
    #worker
    #pending = new Map()
    #messageId = 0
    #initalized = false

    #buffer = []

    constructor() {
    }

    initialize(basePath) {
        if (this.#initalized) return
        const folder = path.resolve(basePath)
        fs.existsSync(folder) || fs.mkdirSync(folder, { recursive: true })
        if (!fs.lstatSync(folder).isDirectory()) {
            throw new Error(`${folder} not a directory.`)
        }
        this.log('debug', `Logger use basePath: ${basePath}`)
        this.#worker = new Worker(join('@/src/logger/logWorker.js'), {
            workerData: {
                basePath,
                ...workerOptions
            }
        })
        this.#setupWorker()
        this.#setupProcessExit()
        this.#initalized = true
        this.#send('initialized')
        for (const b of this.#buffer) {
            const { type, data, timestamp } = b
            this.#post(type, data, timestamp)
        }
    }

    #setupWorker() {
        const worker = this.#worker
        worker.on('message', ({ id, type, data, error }) => {
            const callback = this.#pending.get(id);

            if (callback) {
                if (error) {
                    console.log(error)
                    callback.reject(new Error(error));
                } else {
                    callback.resolve(data);
                }
                this.#pending.delete(id);
            }

            if (type === 'rotate') {
                console.log(`日志文件轮转: ${data.oldFile} -> ${data.newFile}`);
            }
        })
        worker.on('error', (error) => {
            console.error('Worker 错误:', error)
        })
        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Worker 停止，退出码: ${code}`)
            }
        })
    }

    #setupProcessExit() {
        const shutdown = async () => {
            await this.close()
            process.exit(0)
        }
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
        process.on('beforeExit', async () => { await shutdown() });
    }

    async #post(type, data, timestamp) {
        return new Promise((resolve, reject) => {
            const id = ++this.#messageId;
            this.#pending.set(id, { resolve, reject });

            this.#worker.postMessage({
                id,
                type,
                data: {
                    ...data,
                    timestamp
                }
            });
        });
    }

    async #send(type, data = {}, timestamp) {
        timestamp ??= new Date().getTime()
        if (this.#initalized) {
            return this.#post(type, data, timestamp)
        } else {
            this.#buffer.push({ type, data, timestamp })
            return Promise.resolve()
        }
    }

    async #flush() {
        return this.#send('flush');
    }

    async getStats() {
        return this.#send('stats');
    }

    async log(logLevel, message, timestamp) {
        return this.#send('log', {
            message: message,
            level: logLevel
        }, timestamp)
    }

    async close() {
        await this.#flush();
        return new Promise((resolve) => {
            const id = ++this.#messageId;
            this.#pending.set(id, { resolve });
            this.#worker.postMessage({ id, type: 'close' });
        });
    }
}