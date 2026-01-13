import redis from 'redis'

const Result = {
    success: (message) => ({ code: 0, msg: message || 'success' }),
    data: (data, message) => ({ code: 0, msg: message || 'success', data }),
    failed: (reason) => ({ code: -1, msg: reason || 'failed' }),
    notReady: () => ({ code: -1, msg: 'Client not ready' })
}

function checkKey(key) {
    return key && typeof key === 'string' && key.trim() !== ''
}

function checkExpire(expire) {
    return Number.isInteger(expire) && expire > 0
}

export class RedisClient {
    #client
    #ready
    #url
    #timeout
    #keepAlive
    #initialized = false

    constructor(redisOptions = {}) {
        const { host, port = 6379, database = 1, username = 'default', password = '', keepAlive = 30 } = redisOptions
        this.#keepAlive = keepAlive
        this.#url = `redis://${username}:${password}@${host}:${port}/${database}`
        __log.info(`[Redis] Used database: ${database}.`)
    }

    initialization() {
        return this.#tryConnect()
    }

    async #tryResolve(callback) {
        return new Promise(async (resolve) => {
            try {
                await this.#tryConnect()
                callback(resolve)
            } catch (e) {
                resolve(Result.failed())
            } finally {
                this.#resetTimeout()
            }
        }).then((res) => {
            return res
        })
    }

    #tryConnect() {
        return this.#ready ? Promise.resolve() : this.#connect()
    }

    #connect() {
        return new Promise((resolve, reject) => {
            this.#client = redis
                .createClient({ url: this.#url })
                .on('error', (e) => {
                    reject(e)
                    this.#client?.quit?.()
                    this.#client = null
                })
                .on('ready', () => {
                    if (!this.#initialized) {
                        this.#initialized = true
                        __log.info(`[Redis] Initialized.`)
                    }
                    resolve()
                    this.#ready = true
                    this.#resetTimeout()
                })
                .on('end', () => {
                    this.#ready = false
                })
            this.#client?.connect()
        })
    }

    #resetTimeout() {
        const clear = () => {
            clearTimeout(this.#timeout)
            this.#timeout = null
        }
        if (this.#timeout) {
            clear()
        }
        this.#timeout = setTimeout(() => {
            clear()
            if (this.#ready || this.#client) {
                this.#client?.quit?.()
                this.#client = null
            }
        }, 1000 * this.#keepAlive)
    }

    expire(key, expire) {
        return checkKey(key) ? this.#tryResolve(resolve => {
            this.#client.expire(key, expire).then(r => resolve(Result.data(r)))
        }) : Promise.resolve(Result.failed())
    }

    get(key) {
        return checkKey(key) ? this.#tryResolve(resolve => {
            this.#client.get(key).then(res => {
                resolve(Result.data(res))
            })
        }) : Promise.resolve(Result.failed())
    }

    set(key, value, expire) {
        return checkKey(key) ? this.#tryResolve(resolve => {
            this.#client.set(key, value, checkExpire(expire) ? {
                expiration: {
                    type: 'EX',
                    value: expire
                }
            } : null).then(r => {
                resolve(r === 0 ? Result.success() : Result.failed())
            })
        }) : Promise.resolve(Result.failed())
    }

    setIfAbsent(key, value, expire) {
        return checkKey(key) ? this.#tryResolve(resolve => {
            const ops = { condition: 'NX' }
            this.#client.set(key, value, checkExpire(expire) ? {
                expiration: {
                    type: 'EX',
                    value: expire
                },
                ...ops
            } : ops).then(r => {
                resolve(r === 0 ? Result.success() : Result.failed())
            })
        }) : Promise.resolve(Result.failed())
    }

    hGet(key, hashKey) {
        return checkKey(key) && checkKey(hashKey) ? this.#tryResolve(resolve => {
            this.#client.hGet(key, hashKey).then(res => {
                resolve(Result.data(res))
            })
        }) : Promise.resolve(Result.failed())
    }

    hSet(key, hashKey, value) {
        return checkKey(key) && checkKey(hashKey) ? this.#tryResolve(resolve => {
            this.#client.hSet(key, hashKey, value).then(r => {
                resolve(r === 0 ? Result.success() : Result.failed())
            })
        }) : Promise.resolve(Result.failed())
    }

    hExists(key, hashKey) {
        return this.#tryResolve(resolve => {
            this.#client.hExists(key, hashKey).then(r => resolve(Result.data(r)))
        })
    }
}