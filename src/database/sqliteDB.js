import sqlite3 from 'sqlite3'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { Executor } from '../common/executor.js'

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
            const db = new sqlite3.Database(__join(this.#dbPath, dbName + '.db'));
            db.run('PRAGMA journal_mode = DELETE;');
            db.run('PRAGMA busy_timeout = 5000;');
            this.#schema[dbName] = db
        }
        return this.#schema[dbName];
    }

    async #exec(sql, params, options = defaultOptions, dbName) {
        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const db = this.#connect(dbName);
        return new Promise((resolve, reject) => {
            const printer = getPrinter(options)
            printer(`===> Preparing: ${sql}`);
            if (params && params.length > 0) {
                printer(`===> Parameters: `, params.length < 10 ? params : params.length);
            }
            db.run(sql, params || [], function (err) {
                if (err) {
                    reject(err);
                } else {
                    const res = { rows: this.changes, lastId: this.lastID };
                    printer(`<=== Total: ${res.rows}`)
                    resolve(res);
                }
            });
        });
    }

    async #query(sql, params, options = defaultOptions, dbName) {
        if (!dbName) {
            dbName = this.#defaultDbName;
        }
        const { resultMap } = options ?? defaultOptions
        const db = this.#connect(dbName);
        return new Promise((resolve, reject) => {
            const printer = getPrinter(options)
            printer(`===> Preparing: ${sql}`);
            if (params && params.length > 0) {
                printer(`===> Parameters: `, params.length < 10 ? params : params.length);
            }
            db.all(sql, params || [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    printer(`<=== Total: ${rows?.length || 0}`);
                    resolve(setupResult(rows, resultMap));
                }
            });
        });
    }

    async #queryOne(sql, params, options, dbName) {
        return this.#query(sql, params, options, dbName).then(res => {
            return res.rows > 0 ? res.data[0] : null;
        })
    }

    async #tableExists({ tableName, DDL, SqlScript, forceImport }, dbName) {
        const sql = 'SELECT count(*) AS count FROM sqlite_master WHERE type="table" AND name = ?';
        return new Promise(resolve => {
            this.#queryOne(sql, [tableName], null, dbName).then(({ count }) => {
                const tableImport = () => {
                    __log.info(`[Initialize Table] ${tableName}`);
                    this.#tableImport(SqlScript, dbName, tableName).then(() => {
                        __log.info(`[Initialize Over] ${tableName}`);
                        resolve();
                    })
                }
                if (count === 0) {
                    __log.info(`[Create Table] ${tableName}`)
                    this.#exec(DDL, [], null, dbName).then(() => {
                        tableImport();
                    }).catch(ex => {
                        __log.error(`[Create Error] ${tableName}. Cause: ${ex.message}`)
                        resolve()
                    });
                } else if (forceImport) {
                    tableImport()
                } else {
                    resolve();
                }
            })
        })
    }

    async #tableImport(sqlScript, dbName, tableName) {
        if (isBlank(sqlScript)) return Promise.resolve();
        const importSql = readFileSync(__join(sqlScript)).toString();
        return new Promise(resolve => {
            const db = this.#connect(dbName);
            db.serialize(() => {
                __log.info(`[Sql Script] execute sql.`)
                db.run('PRAGMA foreign_keys=OFF;');
                db.run('BEGIN TRANSACTION;');
                const executor = new Executor(() => {
                    db.run(`ANALYZE ${tableName};`, (err) => {
                        if (err) error(`[Analyze Error] ${err.message}`);
                        __log.info("[Sql Script] execute & analyze over.");
                        db.run("COMMIT;");
                        resolve();
                    });
                }, (err) => {
                    __log.error(`[Sql Script] execute error. Cause: ${err.message}`);
                    db.run("ROLLBACK;");
                    resolve();
                });
                for (let query of importSql.split(");")) {
                    if (isNotBlank(query)) {
                        executor.submit((resolve_1, reject_1) => {
                            db.run(query + ');', (err) => {
                                if (err) {
                                    reject_1(err);
                                } else {
                                    resolve_1();
                                }
                            });
                        });
                    }
                }
                executor.start();
            })
        })
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

    getTransactionDB(callback, reject, dbName) {
        const dbName_ = dbName || this.#defaultDbName
        if (this.#schema.hasOwnProperty(dbName_)) {
            return new TransactionSqliteDB(dbName_, this.#dbPath).beginTransaction(callback).catch(reject)
        }
        throw new Error(`No such schema: ${dbName_}`)
    }
}

class TransactionSqliteDB {
    #connection;
    #transactionOver = false;

    constructor(dbName, dbPath) {
        this.#connection = new sqlite3.Database(__join(dbPath, dbName + '.db'));
    }

    async #exec(sql, params, options = defaultOptions) {
        const db = this.#connection;
        return new Promise((resolve, reject) => {
            const printer = getPrinter(options)
            printer(`===> Preparing: ${sql}`);
            if (params && params.length > 0) {
                printer(`===> Parameters: `, params.length < 10 ? params : params.length);
            }
            db.run(sql, params || [], function (err) {
                if (err) {
                    reject(err);
                } else {
                    const res = { rows: this.changes, lastId: this.lastID };
                    printer(`<=== Total: ${res.rows}`);
                    resolve(res);
                }
            });
        });
    }

    async #query(sql, params, options = defaultOptions) {
        const { resultMap } = options ?? defaultOptions
        const db = this.#connection;
        return new Promise((resolve, reject) => {
            const printer = getPrinter(options)
            printer(`===> Preparing: ${sql}`);
            if (params && params.length > 0 && print) {
                printer(`===> Parameters: `, params.length < 10 ? params : params.length);
            }
            db.all(sql, params || [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    printer(`<=== Total: ${rows?.length || 0}`);
                    resolve(setupResult(rows, resultMap));
                }
            });
        });
    }

    async #queryOne(sql, params, options) {
        return this.#query(sql, params, options).then(res => {
            return res.rows > 0 ? res.data[0] : null;
        })
    }

    beginTransaction(callback) {
        const db = this.#connection;
        return new Promise((resolve, reject) => {
            this.#connection.serialize(async () => {
                db.run('PRAGMA foreign_keys=OFF;');
                db.run('BEGIN TRANSACTION;');
                __log.info("====> begin transaction!");
                try {
                    const cbResult = await callback(this);
                    this.#commit();
                    resolve(cbResult);
                } catch (error) {
                    db.run("ROLLBACK;");
                    this.#transactionOver = true;
                    __log.info("====x rollback!");
                    reject(error);
                } finally {
                    db.close();
                    this.#connection = null;
                }
            });
        })
    }

    #commit() {
        if (!this.#transactionOver) {
            this.#connection.run('COMMIT;');
            this.#transactionOver = true;
            __log.info("====> commit!");
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
        return {
            rows: 0,
            data: []
        };
    }
    const result = {
        rows: list.length,
        data: []
    };
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
    if (!resultMap) {
        return result;
    }
    if (isNotEmptyArray(resultMap)) {
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

/**
 * example: COLUMN_NAME -> columnName
 */
const generateColumnProperty = (column) => {
    let result = '';
    if (!column || typeof column !== 'string') {
        return "NULL";
    }
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