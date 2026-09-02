import { createClient } from '@libsql/client';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { AsyncExecutor as Executor } from '#core/infra/asyncExecutor.js';
import { Tracer } from '#core/infra/tracer.js';
import { extractTextEmbedding } from '#utils/transformUtil.js';

const defaultOptions = { print: false, resultMap: null };

/**
 * 根据 options 配置获取日志打印函数
 * @param {DbOptions} [options] - 选项
 * @returns {Function} 日志打印函数
 */
function getPrinter(options) {
    return options?.print ? __log.info : __log.debug;
}

/**
 * SQLite (LibSQL) 数据库操作客户端
 */
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
            };
        }
        this.#dbPath = __join(config.dbPath);
        if (!existsSync(this.#dbPath)) {
            mkdirSync(this.#dbPath);
        }
        this.#defaultDbName = config.defaultDB;
    }

    /**
     * 连接或获取已缓存的指定 Schema 数据库客户端
     * @param {string} dbName - 数据库名称
     * @returns {Promise<import('@libsql/client').Client>} LibSQL 客户端实例
     */
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

    /**
     * 执行单条写 SQL 语句 (INSERT / UPDATE / DELETE)
     * @param {string} sql - SQL 语句
     * @param {Array<any>} [parameters] - 绑定参数
     * @param {DbOptions} [options] - 操作选项
     * @param {string} [dbName] - 数据库名称
     * @returns {Promise<ExecResult>} 执行影响结果
     */
    async #exec(sql, parameters, options = defaultOptions, dbName) {
        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const client = await this.#connect(dbName);

        const printer = getPrinter(options);
        printer(`===> Preparing: ${sql}`);
        const params = tryResolveParams(parameters);
        tryPrintParams(params, printer);

        const context = Tracer.getStore();
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

    /**
     * 批量执行多条写 SQL 语句
     * @param {Array<{ sql: string, params?: Array<any> }>} [batchArgs=[]] - 批处理参数列表
     * @param {DbOptions} [options] - 操作选项
     * @param {string} [dbName] - 数据库名称
     * @returns {Promise<BatchExecResult>} 批处理执行结果
     */
    async #execBatch(batchArgs = [], options = defaultOptions, dbName) {
        if (!batchArgs || batchArgs.length === 0) {
            return { rows: 0, results: [] };
        }

        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const client = await this.#connect(dbName);

        const printer = getPrinter(options);
        printer(`===> Preparing batch execution of ${batchArgs.length} statements.`);
        const batchedArgs = batchArgs.map(({ sql, params }) => {
            printer(`===> Preparing: ${sql}`);
            const parameters = tryResolveParams(params);
            tryPrintParams(parameters, printer);
            return { sql, args: parameters };
        });
        const context = Tracer.getStore();

        try {
            const resSet = await client.batch(batchedArgs, options?.mode || 'write');
            const res = { rows: 0, lastId: undefined, results: [] };
            resSet.forEach(result => {
                const rowsAffected = result.rowsAffected || 0;
                const lastInsertRowid = result.lastInsertRowid ? Number(result.lastInsertRowid) : undefined;
                res.rows += rowsAffected;
                if (lastInsertRowid !== undefined) {
                    res.lastId = lastInsertRowid;
                }
                res.results.push({ rows: rowsAffected, lastId: lastInsertRowid });
            });
            Tracer.run(context, () => {
                printer(`<=== Total: ${res.rows}`);
                printer(`<=== Batch executed ${resSet.length} statements.`);
            });
            return res;
        } catch (err) {
            throw err;
        }
    }

    /**
     * 执行包含多条语句的原始 SQL 文本（如 DDL 建表脚本）
     * @param {string} sql - 多语句 SQL 文本
     * @param {DbOptions} [options] - 操作选项
     * @param {string} [dbName] - 数据库名称
     * @returns {Promise<void>}
     */
    async #execMulti(sql, options = defaultOptions, dbName) {
        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const client = await this.#connect(dbName);
        const printer = getPrinter(options);
        printer(`===> Preparing: ${sql}`);
        await client.executeMultiple(sql);
    }

    /**
     * 执行查询 SQL 语句并返回结构化数据列表
     * @template T
     * @param {string} sql - 查询 SQL 语句
     * @param {Array<any>} [parameters] - 查询参数
     * @param {DbOptions} [options] - 查询选项（支持 print 与 resultMap 驼峰映射）
     * @param {string} [dbName] - 数据库名称
     * @returns {Promise<QueryResult<T>>} 查询结果对象
     */
    async #query(sql, parameters, options = defaultOptions, dbName) {
        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const { resultMap } = options ?? defaultOptions;
        const client = await this.#connect(dbName);

        const printer = getPrinter(options);
        printer(`===> Preparing: ${sql}`);
        const params = tryResolveParams(parameters);
        tryPrintParams(params, printer);

        const context = Tracer.getStore();
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

    /**
     * 执行查询并返回单条记录（若无记录则返回 null）
     * @template T
     * @param {string} sql - 查询 SQL 语句
     * @param {Array<any>} [params] - 查询参数
     * @param {DbOptions} [options] - 查询选项
     * @param {string} [dbName] - 数据库名称
     * @returns {Promise<T|null>} 单条实体记录或 null
     */
    async #queryOne(sql, params, options, dbName) {
        return this.#query(sql, params, options, dbName).then(res => {
            return res.rows > 0 ? res.data[0] : null;
        });
    }

    /**
     * 校验并自动初始化表结构（支持创建、强制导入脚本、重建）
     * @param {{ tableName: string, DDL: string, sqlScript?: string, forceImport?: boolean, recreate?: boolean }} tableConfig
     * @param {string} dbName
     * @returns {Promise<void>}
     */
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
                    });
                };
                const tableCreate = () => {
                    __log.info(`[Create Table] ${tableName}`);
                    this.#execMulti(DDL, null, dbName).then(() => {
                        tableImport();
                    }).catch(ex => {
                        __log.error(`[Create Error] ${tableName}. Cause: ${ex.message}`);
                        resolve();
                    });
                };
                const tableDrop = (resolve_) => {
                    __log.info(`[Drop Table] ${tableName}`);
                    this.#exec(`DROP TABLE IF EXISTS ${tableName}`, [], null, dbName).then(() => {
                        resolve_();
                    }).catch(ex => {
                        __log.error(`[Drop Error] ${tableName}. Cause: ${ex.message}`);
                        resolve();
                    });
                };
                if (count === 0) {
                    tableCreate();
                } else if (recreate) {
                    tableDrop(tableCreate);
                } else if (forceImport) {
                    tableImport();
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 导入初始 SQL 数据脚本
     * @param {string} sqlScript - 脚本文件路径
     * @param {string} dbName - 数据库名称
     * @param {string} tableName - 表名
     * @returns {Promise<void>}
     */
    async #tableImport(sqlScript, dbName, tableName) {
        if (__isBlank(sqlScript)) return Promise.resolve();
        const importSql = readFileSync(__join(sqlScript)).toString();

        const client = await this.#connect(dbName);
        __log.info(`[Sql Script] execute sql via executeMultiple.`);

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
            await client.execute('ROLLBACK;').catch(() => { });
        }
    }

    /**
     * 根据配置文件初始化所有 Schema 和数据表
     * @returns {Promise<void>}
     */
    async initialization() {
        const config = __env.get('sqlite', {
            db: {
                defaultDB: []
            }
        });
        return new Promise(resolve => {
            const this_ = this;
            new Executor(() => {
                resolve();
            }, null).submitAll(Object.keys(config.db).map(dbName => {
                return (resolve_1) => {
                    const executor = new Executor(() => {
                        __log.info(`[Sqlite] Loaded database schema: ${dbName}.`);
                        resolve_1();
                    }, null).submitAll(config.db[dbName].map(table => (resolve_2) => {
                        this_.#tableExists(table, dbName).then(resolve_2);
                    }));
                    executor.start();
                };
            })).start();
        });
    }

    /**
     * 按需重建数据库，回收磁盘空间并重建索引
     * 仅在大量删除/更新后需要整理时调用，避免频繁执行
     * @param {string} [dbName] - 数据库名称（缺省为默认数据库）
     * @returns {Promise<void>}
     */
    async vacuum(dbName) {
        const client = await this.#connect(dbName || this.#defaultDbName);
        __log.info(`[Vacuum] Rebuilding database: ${dbName || this.#defaultDbName}`);
        await client.execute('VACUUM;');
        __log.info(`[Vacuum] Done.`);
    }

    /**
     * 插入数据记录
     * @param {string} sql - 插入 SQL 语句
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 选项配置
     * @param {string} [dbName] - 目标数据库名称
     * @returns {Promise<ExecResult>} 执行影响结果（包含受影响行数与自增 RowID）
     */
    insert(sql, params, options, dbName) {
        return this.#exec(sql, params, options, dbName);
    }

    /**
     * 删除数据记录
     * @param {string} sql - 删除 SQL 语句
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 选项配置
     * @param {string} [dbName] - 目标数据库名称
     * @returns {Promise<ExecResult>} 执行影响结果（包含受影响行数）
     */
    delete(sql, params, options, dbName) {
        return this.#exec(sql, params, options, dbName);
    }

    /**
     * 更新数据记录
     * @param {string} sql - 更新 SQL 语句
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 选项配置
     * @param {string} [dbName] - 目标数据库名称
     * @returns {Promise<ExecResult>} 执行影响结果（包含受影响行数）
     */
    update(sql, params, options, dbName) {
        return this.#exec(sql, params, options, dbName);
    }

    /**
     * 批量更新/插入/删除数据记录
     * @param {Array<{ sql: string, params?: Array<any> }>} batchArgs - 批量 SQL 与参数数组
     * @param {DbOptions} [options] - 选项配置
     * @param {string} [dbName] - 目标数据库名称
     * @returns {Promise<BatchExecResult>} 批量执行结果对象
     */
    updateBatch(batchArgs, options, dbName) {
        return this.#execBatch(batchArgs, options, dbName);
    }

    /**
     * 查询多条数据记录
     * @template T
     * @param {string} sql - 查询 SQL 语句
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 查询选项（print, resultMap 驼峰转换）
     * @param {string} [dbName] - 目标数据库名称
     * @returns {Promise<QueryResult<T>>} 查询结果对象（包含 rows 行数与 data 实体数组）
     */
    selectAll(sql, params, options, dbName) {
        return this.#query(sql, params, options, dbName);
    }

    /**
     * 查询单条数据记录
     * @template T
     * @param {string} sql - 查询 SQL 语句
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 查询选项
     * @param {string} [dbName] - 目标数据库名称
     * @returns {Promise<T|null>} 单条实体记录，不存在时返回 null
     */
    selectOne(sql, params, options, dbName) {
        return this.#queryOne(sql, params, options, dbName);
    }

    /**
     * 向量相似度搜索 (Vector Cosine Similarity Search)
     * @template T
     * @param {Object} options - 向量检索选项
     * @param {string} options.tableName - 表名
     * @param {string} options.embedColumn - 向量列名
     * @param {string} options.embedStr - 查询文本或向量表达式 (用于提取向量)
     * @param {number} [options.similarity=0.8] - 相似度阈值 (0~1), 默认 0.8
     * @param {number} [options.limit=20] - 最大返回条数
     * @param {Array<string>} [options.selectColumns] - 查询列列表
     * @param {string} [options.extraWhere] - 额外 WHERE 过滤条件 (不含前缀 AND)
     * @param {Array<any>} [options.whereParams] - 额外 WHERE 条件参数列表
     * @param {string} [options.indexName] - 向量索引名
     * @param {string} [options.vectorFunc='vector8'] - vector 计算函数 (vector8 或 vector1bit)
     * @param {DbOptions} [options.options] - 透传数据库选项 (print, resultMap)
     * @param {string} [dbName] - 数据库名
     * @returns {Promise<QueryResult<T & { _distance: number, _similarity: number }>>} 包含相似度得分的查询结果
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

    /**
     * 获取事务执行器并在事务中执行回调业务
     * @template R
     * @param {(tx: TransactionLibSqlDB) => Promise<R>} callback - 事务业务执行回调（自动提交与回滚）
     * @param {(err: any) => void} [reject] - 失败异常回调
     * @param {string} [dbName] - 目标数据库名称
     * @returns {Promise<R>} 回调执行返回值
     */
    async getTransactionDB(callback, reject, dbName) {
        const dbName_ = dbName || this.#defaultDbName;
        if (this.#schema.hasOwnProperty(dbName_)) {
            try {
                return await new TransactionLibSqlDB(this.#schema[dbName_]).beginTransaction(callback);
            } catch (error) {
                if (__isFunction?.(reject)) {
                    reject(error);
                } else {
                    throw error;
                }
            }
        }
        throw new Error(`No such schema: ${dbName_}`);
    }

    /**
     * 关闭并移除指定 Schema 数据库客户端连接
     * @param {string} dbName - 数据库名称
     * @returns {Promise<void>}
     */
    async close(dbName) {
        if (this.#schema.hasOwnProperty(dbName)) {
            const client = this.#schema[dbName];
            Reflect.deleteProperty(this.#schema, dbName);
            client.close();
        }
    }

    /**
     * 重新连接指定 Schema 数据库
     * @param {string} dbName - 数据库名称
     * @returns {Promise<import('@libsql/client').Client>}
     */
    async reconnect(dbName) {
        return await this.#connect(dbName);
    }
}

/**
 * 事务操作客户端（在独立事务生命周期内运行，仅供内部实例化）
 */
class TransactionLibSqlDB {
    #client;
    #tx = null;

    /**
     * @param {import('@libsql/client').Client} client
     */
    constructor(client) {
        this.#client = client;
    }

    /**
     * 在事务内执行单条写 SQL
     * @param {string} sql - SQL 语句
     * @param {Array<any>} [parameters] - 绑定参数
     * @param {DbOptions} [options] - 操作选项
     * @returns {Promise<ExecResult>}
     */
    async #exec(sql, parameters, options = defaultOptions) {
        const printer = getPrinter(options);
        printer(`===> Preparing: ${sql}`);
        const params = tryResolveParams(parameters);
        tryPrintParams(params, printer);
        const context = Tracer.getStore();
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

    /**
     * 在事务内执行查询 SQL
     * @template T
     * @param {string} sql - 查询 SQL
     * @param {Array<any>} [parameters] - 绑定参数
     * @param {DbOptions} [options] - 查询选项
     * @returns {Promise<QueryResult<T>>}
     */
    async #query(sql, parameters, options = defaultOptions) {
        const { resultMap } = options ?? defaultOptions;
        const printer = getPrinter(options);
        printer(`===> Preparing: ${sql}`);
        const params = tryResolveParams(parameters);
        tryPrintParams(params, printer);
        const context = Tracer.getStore();
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

    /**
     * 在事务内查询单条记录
     * @template T
     * @param {string} sql - 查询 SQL
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 查询选项
     * @returns {Promise<T|null>}
     */
    async #queryOne(sql, params, options) {
        return this.#query(sql, params, options).then(res => {
            return res.rows > 0 ? res.data[0] : null;
        });
    }

    /**
     * 在事务内执行多语句原始 SQL
     * @param {string} sql - 多语句 SQL 文本
     * @returns {Promise<void>}
     */
    async execute(sql) {
        await this.#tx.executeMultiple(sql);
    }

    /**
     * 开启并管理事务生命周期
     * @template R
     * @param {(tx: TransactionLibSqlDB) => Promise<R>} callback - 事务内执行的业务逻辑
     * @returns {Promise<R>}
     */
    async beginTransaction(callback) {
        const snapshot = Tracer.getStore();

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

    /**
     * 事务内插入数据记录
     * @param {string} sql - 插入 SQL
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 选项配置
     * @returns {Promise<ExecResult>}
     */
    insert(sql, params, options) {
        return this.#exec(sql, params, options);
    }

    /**
     * 事务内删除数据记录
     * @param {string} sql - 删除 SQL
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 选项配置
     * @returns {Promise<ExecResult>}
     */
    delete(sql, params, options) {
        return this.#exec(sql, params, options);
    }

    /**
     * 事务内更新数据记录
     * @param {string} sql - 更新 SQL
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 选项配置
     * @returns {Promise<ExecResult>}
     */
    update(sql, params, options) {
        return this.#exec(sql, params, options);
    }

    /**
     * 事务内查询多条数据记录
     * @template T
     * @param {string} sql - 查询 SQL
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 选项配置
     * @returns {Promise<QueryResult<T>>}
     */
    selectAll(sql, params, options) {
        return this.#query(sql, params, options);
    }

    /**
     * 事务内查询单条数据记录
     * @template T
     * @param {string} sql - 查询 SQL
     * @param {Array<any>} [params] - 绑定参数
     * @param {DbOptions} [options] - 选项配置
     * @returns {Promise<T|null>}
     */
    selectOne(sql, params, options) {
        return this.#queryOne(sql, params, options);
    }

    /**
     * 事务内执行向量相似度检索
     * @template T
     * @param {Object} options - 检索选项
     * @returns {Promise<QueryResult<T>>}
     */
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
        return this.#query(sql, params, opts);
    }
}

/**
 * 格式化查询结果集（应用下划线转驼峰与自定义 resultMap 映射）
 * @template T
 * @param {Array<any>} rows - LibSQL 原始行数据
 * @param {DbOptions['resultMap']} resultMap - 字段映射表
 * @returns {QueryResult<T>} 格式化后的查询结果
 */
const setupResult = (rows, resultMap) => {
    let list;
    if (!rows || (list = Array.from(rows), list.length === 0)) {
        return { rows: 0, data: [] };
    }
    const result = { rows: list.length, data: [] };
    resultMap = generateResultMap(resultMap);
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
        });
        result.data.push(resultObj);
    }
    return result;
};

/**
 * 解析生成标准化 resultMap 字典
 * @param {DbOptions['resultMap']} resultMap - 输入映射配置
 * @returns {Record<string, string>} 标准化映射字典
 */
const generateResultMap = (resultMap) => {
    const result = {};
    if (!resultMap) return result;
    if (__isNotEmptyArray(resultMap)) {
        resultMap.forEach(e => {
            if (e.hasOwnProperty('property') && e.hasOwnProperty('column')) {
                result[e.column] = e.property;
            }
        });
    } else if (resultMap instanceof Object) {
        Object.keys(resultMap).forEach(k => {
            result[resultMap[k]] = k;
        });
    }
    return result;
};

/**
 * 将数据库下划线字段名转为驼峰属性名 (例如 user_name -> userName)
 * @param {string} column - 列名
 * @returns {string} 驼峰命名的属性名
 */
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
};

/**
 * 将 undefined 参数转为 null 以兼容 SQLite 参数绑定
 * @param {Array<any>} params - 原始参数
 * @returns {Array<any>} 过滤后的参数数组
 */
const tryResolveParams = (params) => {
    const result = params || [];
    return result.map(o => o === undefined ? null : o);
};

/**
 * 调试模式下截断并打印 SQL 绑定参数
 * @param {Array<any>} params - 参数列表
 * @param {Function} printer - 日志输出函数
 */
const tryPrintParams = (params, printer) => {
    if (!params || params.length === 0) {
        return;
    } else if (params.length >= 10) {
        printer(`===> Parameters total: ${params.length}`);
    } else {
        printer(`===> Parameters: `, params.map(p => typeof p === 'string' && p.length > 500 ? (p.substring(0, 500) + '...') : p));
    }
};