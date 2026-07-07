import { createClient } from '@libsql/client'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { AsyncExecutor as Executor } from '../infra/asyncExecutor.js'
import { Tracer } from '../infra/tracer.js'

const defaultOptions = { print: false, resultMap: null }

function getPrinter(options) {
    return options?.print ? __log.info : __log.debug
}

export class SqliteDB {
    #schema = {};
    #defaultDbName;
    #dbPath;

    constructor() {
        let config = __env.get('sqlite');
        if (!config) {
            config = {
                db: {
                    defaultDB: []
                },
                defaultDB: "defaultDB",
                dbPath: "./"
            }
        }
        this.#dbPath = __join(config.dbPath);
        if (!existsSync(this.#dbPath)) {
            mkdirSync(this.#dbPath);
        }
        this.#defaultDbName = config.defaultDB;
    }

    #connect(dbName) {
        if (!this.#schema.hasOwnProperty(dbName)) {
            const dbFile = __join(this.#dbPath, dbName + '.db');
            const client = createClient({
                url: `file:${dbFile}`
            });

            client.execute('PRAGMA journal_mode = DELETE;');
            client.execute('PRAGMA busy_timeout = 5000;');

            this.#schema[dbName] = client;
        }
        return this.#schema[dbName];
    }

    async #exec(sql, parameters, options = defaultOptions, dbName) {
        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const client = this.#connect(dbName);

        const printer = getPrinter(options)
        printer(`===> Preparing: ${sql}`);
        const params = tryResolveParams(parameters)
        if (params && params.length > 0) {
            printer(`===> Parameters: `, params.length < 10 ? params : params.length);
        }

        const context = Tracer.getStore()
        try {
            const resSet = await client.execute({ sql, args: params || [] });

            const res = {
                rows: resSet.rowsAffected,
                lastId: resSet.lastInsertRowid ? Number(resSet.lastInsertRowid) : undefined
            };

            Tracer.run(context, () => printer(`<=== Total: ${res.rows}`));
            return res;
        } catch (err) {
            throw err;
        }
    }

    async #query(sql, parameters, options = defaultOptions, dbName) {
        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const { resultMap } = options ?? defaultOptions
        const client = this.#connect(dbName);

        const printer = getPrinter(options)
        printer(`===> Preparing: ${sql}`);
        const params = tryResolveParams(parameters)
        if (params && params.length > 0) {
            printer(`===> Parameters: `, params.length < 10 ? params : params.length);
        }

        const context = Tracer.getStore()
        try {
            const resSet = await client.execute({ sql, args: params || [] });

            return Tracer.run(context, () => {
                const rows = resSet.rows;
                printer(`<=== Total: ${rows?.length || 0}`);
                return setupResult(rows, resultMap);
            });
        } catch (err) {
            throw err;
        }
    }

    async #queryOne(sql, params, options, dbName) {
        return this.#query(sql, params, options, dbName).then(res => {
            return res.rows > 0 ? res.data[0] : null;
        })
    }

    async #tableExists({ tableName, DDL, sqlScript, forceImport, recreate }, dbName) {
        const sql = `SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name = ?`;
        return new Promise(resolve => {
            this.#queryOne(sql, [tableName], null, dbName).then((res) => {
                const count = res?.count || 0;
                const tableImport = () => {
                    __log.info(`[Initialize Table] ${tableName}`);
                    this.#tableImport(sqlScript, dbName, tableName).then(() => {
                        __log.info(`[Initialize Over] ${tableName}`);
                        resolve();
                    })
                }
                const tableCreate = () => {
                    __log.info(`[Create Table] ${tableName}`)
                    this.#exec(DDL, [], null, dbName).then(() => {
                        tableImport();
                    }).catch(ex => {
                        __log.error(`[Create Error] ${tableName}. Cause: ${ex.message}`)
                        resolve()
                    });
                }
                const tableDrop = (resolve_) => {
                    __log.info(`[Drop Table] ${tableName}`)
                    this.#exec(`DROP TABLE IF EXISTS ${tableName}`, [], null, dbName).then(() => {
                        resolve_();
                    }).catch(ex => {
                        __log.error(`[Drop Error] ${tableName}. Cause: ${ex.message}`)
                        resolve()
                    });
                }
                if (count === 0) {
                    tableCreate()
                } else if (recreate) {
                    tableDrop(tableCreate)
                } else if (forceImport) {
                    tableImport()
                } else {
                    resolve();
                }
            })
        })
    }

    async #tableImport(sqlScript, dbName, tableName) {
        if (__isBlank(sqlScript)) return Promise.resolve();
        const importSql = readFileSync(__join(sqlScript)).toString();

        const client = this.#connect(dbName);
        __log.info(`[Sql Script] execute sql via Batch.`)

        try {
            await client.execute('PRAGMA foreign_keys=OFF;');
            const tx = await client.transaction("write");

            const batchCommands = [];

            return new Promise(resolve => {
                const executor = new Executor(async () => {
                    try {
                        __log.info(`[Sql Script] Sending ${batchCommands.length} commands to SQLite batch...`);
                        await tx.batch(batchCommands);

                        await tx.execute(`ANALYZE ${tableName};`);
                        await tx.commit();
                        __log.info("[Sql Script] execute & analyze over.");
                    } catch (err) {
                        __log.error(`[Batch Error] ${err.message}`);
                        await tx.rollback();
                    } finally {
                        tx.close();
                        resolve();
                    }
                }, async (err) => {
                    __log.error(`[Sql Script] execute error. Cause: ${err.message}`);
                    await tx.rollback();
                    tx.close();
                    resolve();
                }, 1);
                for (let query of importSql.split(");")) {
                    if (__isNotBlank(query)) {
                        executor.submit((resolve_1, reject_1) => {
                            batchCommands.push({
                                sql: query + ');',
                                args: []
                            });
                            resolve_1();
                        });
                    }
                }
                executor.start();
            });
        } catch (err) {
            __log.error(`[Sql Script] init error. Cause: ${err.message}`);
        }
    }

    async initialization() {
        const config = __env.get('sqlite', {
            db: {
                defaultDB: []
            }
        })
        return new Promise(resolve => {
            const this_ = this;
            new Executor(() => {
                resolve()
            }, null).submitAll(Object.keys(config.db).map(dbName => {
                return (resolve_1) => {
                    const executor = new Executor(() => {
                        __log.info(`[Sqlite] Loaded database schema: ${dbName}.`);
                        resolve_1()
                    }, null).submitAll(config.db[dbName].map(table => (resolve_2) => {
                        this_.#tableExists(table, dbName).then(resolve_2);
                    }));
                    executor.start();
                }
            })).start();
        })
    }

    insert(sql, params, options, dbName) {
        return this.#exec(sql, params, options, dbName);
    }

    delete(sql, params, options, dbName) {
        return this.#exec(sql, params, options, dbName);
    }

    update(sql, params, options, dbName) {
        return this.#exec(sql, params, options, dbName);
    }

    selectAll(sql, params, options, dbName) {
        return this.#query(sql, params, options, dbName);
    }

    selectOne(sql, params, options, dbName) {
        return this.#queryOne(sql, params, options, dbName);
    }

    async getTransactionDB(callback, reject, dbName) {
        const dbName_ = dbName || this.#defaultDbName
        if (this.#schema.hasOwnProperty(dbName_)) {
            try {
                // 8. 传入已经初始化的 client 实例到事务封装中
                return await new TransactionLibSqlDB(this.#schema[dbName_]).beginTransaction(callback)
            } catch (error) {
                if (__isFunction?.(reject)) {
                    reject(error)
                } else {
                    throw error
                }
            }
        }
        throw new Error(`No such schema: ${dbName_}`)
    }

    async close(dbName) {
        if (this.#schema.hasOwnProperty(dbName)) {
            const client = this.#schema[dbName]
            Reflect.deleteProperty(this.#schema, dbName)
            client.close();
        }
    }

    async reconnect(dbName) {
        return this.#connect(dbName)
    }
}

// 10. 全面改造事务处理类
class TransactionLibSqlDB {
    #client;
    #tx = null;

    constructor(client) {
        this.#client = client;
    }

    async #exec(sql, parameters, options = defaultOptions) {
        const printer = getPrinter(options)
        printer(`===> Preparing: ${sql}`);
        const params = tryResolveParams(parameters)
        if (params && params.length > 0) {
            printer(`===> Parameters: `, params.length < 10 ? params : params.length);
        }
        const context = Tracer.getStore()
        try {
            // 在事务对象 tx 上执行命令
            const resSet = await this.#tx.execute({ sql, args: params || [] });
            const res = {
                rows: resSet.rowsAffected,
                lastId: resSet.lastInsertRowid ? Number(resSet.lastInsertRowid) : undefined
            };
            Tracer.run(context, () => printer(`<=== Total: ${res.rows}`));
            return res;
        } catch (err) {
            throw err;
        }
    }

    async #query(sql, parameters, options = defaultOptions) {
        const { resultMap } = options ?? defaultOptions
        const printer = getPrinter(options)
        printer(`===> Preparing: ${sql}`);
        const params = tryResolveParams(parameters)
        if (params && params.length > 0) {
            printer(`===> Parameters: `, params.length < 10 ? params : params.length);
        }
        const context = Tracer.getStore()
        try {
            const resSet = await this.#tx.execute({ sql, args: params || [] });
            return Tracer.run(context, () => {
                const rows = resSet.rows;
                printer(`<=== Total: ${rows?.length || 0}`);
                return setupResult(rows, resultMap);
            });
        } catch (err) {
            throw err;
        }
    }

    async #queryOne(sql, params, options) {
        return this.#query(sql, params, options).then(res => {
            return res.rows > 0 ? res.data[0] : null;
        })
    }

    async execute(sql) {
        const context = Tracer.getStore()
        try {
            await this.#tx.execute(sql);
            Tracer.run(context, () => { });
        } catch (err) {
            throw err;
        }
    }

    async beginTransaction(callback) {
        const snapshot = Tracer.getStore()

        // 11. 使用 libsql 官方提供的 client.transaction() 开启真实事务
        this.#tx = await this.#client.transaction("write");
        __log.info("====> begin transaction!");

        try {
            await this.#tx.execute('PRAGMA foreign_keys=OFF;');
            const cbResult = await Tracer.run(snapshot, () => callback(this));

            await this.#tx.commit();
            __log.info("====> commit!");
            return cbResult;
        } catch (error) {
            await this.#tx.rollback();
            __log.info("====x rollback!");
            throw error;
        } finally {
            this.#tx.close();
            this.#tx = null;
        }
    }

    insert(sql, params, options) {
        return this.#exec(sql, params, options);
    }

    delete(sql, params, options) {
        return this.#exec(sql, params, options);
    }

    update(sql, params, options) {
        return this.#exec(sql, params, options);
    }

    selectAll(sql, params, options) {
        return this.#query(sql, params, options);
    }

    selectOne(sql, params, options) {
        return this.#queryOne(sql, params, options);
    }
}

const setupResult = (rows, resultMap) => {
    let list;
    if (!rows || (list = Array.from(rows), list.length === 0)) {
        return { rows: 0, data: [] };
    }
    const result = { rows: list.length, data: [] };
    resultMap = generateResultMap(resultMap)
    for (let i = 0; i < list.length; i++) {
        const data = list[i];
        const resultObj = {};
        Object.keys(data).forEach(k => {
            let resultKey = resultMap.hasOwnProperty(k) ? resultMap[k] : generateColumnProperty(k);
            if (resultObj.hasOwnProperty(resultKey)) {
                resultObj[resultKey + "_1"] = data[k];
            } else {
                resultObj[resultKey] = data[k];
            }
        })
        result.data.push(resultObj)
    }
    return result;
}

const generateResultMap = (resultMap) => {
    const result = {};
    if (!resultMap) return result;
    if (__isNotEmptyArray(resultMap)) {
        resultMap.forEach(e => {
            if (e.hasOwnProperty('property') && e.hasOwnProperty('column')) {
                result[e.column] = e.property;
            }
        })
    } else if (resultMap instanceof Object) {
        Object.keys(resultMap).forEach(k => {
            result[resultMap[k]] = k;
        })
    }
    return result;
}

const generateColumnProperty = (column) => {
    let result = '';
    if (!column || typeof column !== 'string') return "NULL";
    let isLastUnderline = false;
    for (let i = 0; i < column.length; i++) {
        const str = column.charAt(i);
        if (str === '_') {
            isLastUnderline = true;
            continue;
        }
        if (isLastUnderline) result += str.toLocaleUpperCase();
        else result += str;
        isLastUnderline = false;
    }
    return result;
}

const tryResolveParams = (params) => {
    const result = params || []
    return result.map(o => o === undefined ? null : o)
}