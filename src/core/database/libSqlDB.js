import { createClient } from '@libsql/client'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { AsyncExecutor as Executor } from '../infra/asyncExecutor.js'
import { Tracer } from '../infra/tracer.js'
import { extractTextEmbedding } from '../../common/utils/transformUtil.js'

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

    async #connect(dbName) {
        if (!this.#schema.hasOwnProperty(dbName)) {
            const dbFile = __join(this.#dbPath, dbName + '.db');
            const client = createClient({
                url: `file:${dbFile}`
            });

            await client.execute('PRAGMA journal_mode = DELETE;');
            await client.execute('PRAGMA busy_timeout = 5000;');
            await client.execute('PRAGMA auto_vacuum = 1;');
            this.#schema[dbName] = client;
        }
        return this.#schema[dbName];
    }

    async #exec(sql, parameters, options = defaultOptions, dbName) {
        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const client = await this.#connect(dbName);

        const printer = getPrinter(options)
        printer(`===> Preparing: ${sql}`);
        const params = tryResolveParams(parameters)
        tryPrintParams(params, printer)

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

    async #execBatch(sql, options = defaultOptions, dbName) {
        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const client = await this.#connect(dbName);
        const printer = getPrinter(options)
        printer(`===> Preparing: ${sql}`);
        const context = Tracer.getStore()
        await client.executeMultiple(sql);
    }

    async #query(sql, parameters, options = defaultOptions, dbName) {
        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const { resultMap } = options ?? defaultOptions
        const client = await this.#connect(dbName);

        const printer = getPrinter(options)
        printer(`===> Preparing: ${sql}`);
        const params = tryResolveParams(parameters)
        tryPrintParams(params, printer)

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
                    this.#execBatch(DDL, null, dbName).then(() => {
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

        const client = await this.#connect(dbName);
        __log.info(`[Sql Script] execute sql via executeMultiple.`)

        try {
            await client.execute('PRAGMA foreign_keys=OFF;');
            await client.execute('BEGIN;');

            // executeMultiple handles multiple SQL statements correctly
            await client.executeMultiple(importSql);
            await client.execute(`ANALYZE ${tableName};`);
            await client.execute('COMMIT;');

            __log.info("[Sql Script] execute & analyze over.");
        } catch (err) {
            __log.error(`[Sql Script] execute error. Cause: ${err.message}`);
            await client.execute('ROLLBACK;').catch(() => {});
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

    /**
     * 按需重建数据库，回收空间、重建索引。
     * 仅在大量删除/更新后需要整理时调用，避免频繁执行。
     */
    async vacuum(dbName) {
        const client = await this.#connect(dbName || this.#defaultDbName);
        __log.info(`[Vacuum] Rebuilding database: ${dbName || this.#defaultDbName}`);
        await client.execute('VACUUM;');
        __log.info(`[Vacuum] Done.`);
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

    /**
     * 向量相似度搜索
     * @param {Object} options
     * @param {string} options.tableName - 表名
     * @param {string} options.embedColumn - 向量列名
     * @param {string} options.embedStr - 查询向量 (已归一化的数组)
     * @param {number} [options.similarity=0.8] - 相似度阈值 (0~1), 默认 0.8
     * @param {number} [options.limit=20] - 最大返回条数
     * @param {Array<string>} [options.selectColumns] - 查询列
     * @param {string} [options.extraWhere] - 额外 WHERE 条件 (不含 AND)
     * @param {Array<any>} [options.whereParams] - 额外 WHERE 条件传参
     * @param {string} [options.vectorFunc] - vector计算的函数, 默认vector8
     * @param {Object} [options.options] - 透传 options (print, resultMap)
     * @param {string} [dbName] - 数据库名
     * @returns {Promise<{rows: number, data: Array}>}
     */
    async vectorSearch(options, dbName) {
        const {
            tableName,
            embedColumn,
            embedStr,
            similarity = 0.8,
            limit = 20,
            selectColumns = [],
            extraWhere = '',
            whereParams = [],
            indexName = `${tableName}_${embedColumn}_idx`,
            vectorFunc = `vector8`
        } = options;
        if (!tableName || !embedColumn || !embedStr) {
            throw new Error('vectorSearch: tableName, embedColumn and embedStr are required');
        }
        const embedValue = await extractTextEmbedding(embedStr);
        const vectorStr = JSON.stringify(embedValue);
        const distanceFn = `vector_distance_cos(t.${embedColumn}, ${vectorFunc}(?))` + (vectorFunc === 'vector1bit' ? '/1024' : '');
        let whereClause = `(1 - ${distanceFn}) >= ?`;
        const params = [vectorStr, similarity];
        if (__isNotBlank(extraWhere)) {
            whereClause = `(${whereClause}) AND (${extraWhere})`;
            params.push(...whereParams);
        }
        const sql = `SELECT `
            + `${__isEmptyArray(selectColumns) ? 't.*' : selectColumns.map(c => `t.${c}`).join(', ')}, `
            + `${distanceFn} AS _distance, `
            + `(1 - ${distanceFn}) AS _similarity `
            + `FROM vector_top_k(?, ${vectorFunc}(?), ?) AS v `
            + `JOIN ${tableName} t ON t.rowid = v.id `
            + `WHERE ${whereClause} `
            + `ORDER BY _distance ASC`;
        params.unshift(
            vectorStr, vectorStr,
            indexName, vectorStr, limit
        );
        const opts = options.options || defaultOptions;
        return this.#query(sql, params, opts, dbName);
    }

    async getTransactionDB(callback, reject, dbName) {
        const dbName_ = dbName || this.#defaultDbName
        if (this.#schema.hasOwnProperty(dbName_)) {
            try {
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
        return await this.#connect(dbName)
    }
}

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
        tryPrintParams(params, printer)
        const context = Tracer.getStore()
        try {
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
        tryPrintParams(params, printer)
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
            await this.#tx.executeMultiple(sql);
            Tracer.run(context, () => { });
        } catch (err) {
            throw err;
        }
    }

    async beginTransaction(callback) {
        const snapshot = Tracer.getStore()

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

    async vectorSearch(options) {
        const {
            tableName,
            embedColumn,
            embedStr,
            similarity = 0.8,
            limit = 20,
            selectColumns = [],
            extraWhere = '',
            whereParams = [],
            indexName = `${tableName}_${embedColumn}_idx`,
            vectorFunc = `vector8`
        } = options;
        if (!tableName || !embedColumn || !embedStr) {
            throw new Error('vectorSearch: tableName, embedColumn and embedStr are required');
        }
        const embedValue = await extractTextEmbedding(embedStr);
        const vectorStr = JSON.stringify(embedValue);
        const distanceFn = `vector_distance_cos(t.${embedColumn}, ${vectorFunc}(?))` + (vectorFunc === 'vector1bit' ? '/1024' : '');
        let whereClause = `(1 - ${distanceFn}) >= ?`;
        const params = [vectorStr, similarity];
        if (__isNotBlank(extraWhere)) {
            whereClause = `(${whereClause}) AND (${extraWhere})`;
            params.push(...whereParams);
        }
        const sql = `SELECT `
            + `${__isEmptyArray(selectColumns) ? 't.*' : selectColumns.map(c => `t.${c}`).join(', ')}, `
            + `${distanceFn} AS _distance, `
            + `(1 - ${distanceFn}) AS _similarity `
            + `FROM vector_top_k(?, ${vectorFunc}(?), ?) AS v `
            + `JOIN ${tableName} t ON t.rowid = v.id `
            + `WHERE ${whereClause} `
            + `ORDER BY _distance ASC`;
        params.unshift(
            vectorStr, vectorStr,
            indexName, vectorStr, limit
        );
        const opts = options.options || defaultOptions;
        return this.#query(sql, params, opts, dbName);
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

const tryPrintParams = (params, printer) => {
    if (!params || params.length === 0) {
        return;
    } else if (params.length >= 10) {
        printer(`===> Parameters total: ${params.length}`)
    } else {
        printer(`===> Parameters: `, params.map(p => typeof p === 'string' && p.length > 500 ? (p.substring(0, 500) + '...') : p));
    }
}