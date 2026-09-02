import type { SqliteDB } from "../src/core/database/libSqlDB.js";
import type { RedisClient } from "../src/core/database/redisDB.js";
import type { ContextSubscribe } from "../src/core/context/subscribe.js";

export { };

declare global {
    interface ProcessArgs {
        [key: string]: any;
        /** 判断是否存在指定命令行参数 */
        has(key: string): boolean;
    }

    interface GlobalLogger {
        /** 控制台原始输出 (无级别前缀) */
        print(...message: any[]): void;
        /** 普通日志输出 (带 `>` 前缀) */
        log(...message: any[]): void;
        /** 错误日志输出 (ERROR 级别) */
        error(...message: any[]): void;
        /** 警告日志输出 (WARN 级别) */
        warn(...message: any[]): void;
        /** 信息日志输出 (INFO 级别) */
        info(...message: any[]): void;
        /** 调试日志输出 (DEBUG 级别) */
        debug(...message: any[]): void;
    }

    interface GlobalEnv {
        /** 获取环境配置项，支持点分嵌套路径与默认值 */
        get<T = any>(key: string, defaultValue?: T): T;
        /** 获取环境配置项并尝试执行数学/表达式计算 (基于 mathjs) */
        getEvaluate<T = any>(key: string, defaultValue?: T): T;
        /** 注册环境配置刷新监听订阅者 */
        subscribe(sub: ContextSubscribe | any): void;
        /** 注销环境配置刷新监听订阅者 */
        unsubscribe(sub: ContextSubscribe | any): void;
        /** 判断当前是否处于开发环境 (dev) */
        isDev(): boolean;
    }

    /**
     * 数据库列表查询结果泛型结构体
     * @template T - 单行记录的数据类型
     */
    interface QueryResult<T = any> {
        /** 查询返回的结果行数 */
        rows: number;
        /** 查询返回的数据对象列表 */
        data: T[];
    }

    /**
     * 数据库 DML (INSERT / UPDATE / DELETE) 执行结果结构体
     */
    interface ExecResult {
        /** 影响的行数 */
        rows: number;
        /** 插入自增 RowID（若有） */
        lastId?: number;
    }

    /**
     * 数据库批量操作执行结果结构体
     */
    interface BatchExecResult {
        /** 累计受影响行数 */
        rows: number;
        /** 最后一条插入的 RowID */
        lastId?: number;
        /** 每条 SQL 语句对应的执行结果列表 */
        results: ExecResult[];
    }

    /**
     * 数据库查询与执行配置项
     */
    interface DbOptions {
        /** 是否打印当前 SQL 执行日志 */
        print?: boolean;
        /** 列名到实体属性名的映射 */
        resultMap?: Record<string, string> | Array<{ column: string; property: string }> | null;
        /** 批量执行模式 */
        mode?: 'write' | 'read' | 'deferred';
    }

    /**
     * 应用程序根目录绝对路径
     */
    var __dirname: string;

    /**
     * 命令行启动参数解析对象
     */
    var __args: ProcessArgs;

    /**
     * 全局多级别日志打印器
     */
    var __log: GlobalLogger;

    /**
     * 全局环境配置与上下文管理对象
     */
    var __env: GlobalEnv;

    /**
     * 全局 SQLite (LibSQL) 数据库操作实例
     */
    var __sqliteDB: SqliteDB;

    /**
     * 全局 Redis 客户端操作实例 (若未启用 Redis 则为 null)
     */
    var __redisClient: RedisClient | null;

    /**
     * 路径拼接工具函数（自动将 `@` 开头的路径解析映射为应用程序根路径）
     */
    function __join(...args: (string | undefined | null)[]): string;

    /**
     * 校验对象是否既非 undefined 也非 null (非空类型守卫)
     */
    function __notNull<T>(obj: T): obj is NonNullable<T>;

    /**
     * 校验字符串是否为空 (为 null / undefined 或去除首尾空格后为空字符串)
     */
    function __isBlank(str: any): boolean;

    /**
     * 校验传入的所有参数是否全部为空白
     */
    function __isAllBlank(...args: any[]): boolean;

    /**
     * 校验传入的参数中是否存在任意一个空白项
     */
    function __isAnyBlank(...args: any[]): boolean;

    /**
     * 若字符串非空白则返回原值，否则返回备用默认值
     */
    function __isBlankOr<T, U = T>(str: T, elseStr: U): NonNullable<T> | U;

    /**
     * 校验字符串是否非空 (非 null / undefined 且去除首尾空格后不为空)
     */
    function __isNotBlank(str: any): boolean;

    /**
     * 校验是否为非空数组 (非 null / undefined、为数组且 length > 0)
     */
    function __isNotEmptyArray<T = any>(arr: any): arr is T[];

    /**
     * 校验是否为空数组 (为 null / undefined、非数组或 length === 0)
     */
    function __isEmptyArray(arr: any): boolean;

    /**
     * 抛出标准 Error 异常
     */
    function __throwError(reason?: string | Error): never;

    /**
     * 抛出包含 msg、code、status 的结构化业务错误对象
     */
    function __throwMessage(message: string, code?: number, status?: number): never;

    /**
     * 校验目标值是否为函数 (函数类型守卫)
     */
    function __isFunction(func: any): func is (...args: any[]) => any;

    /**
     * 校验目标值是否为 Promise 实例 (Promise 类型守卫)
     */
    function __isPromise<T = any>(obj: any): obj is Promise<T>;

    /**
     * 校验目标值是否为 Error 实例 (Error 类型守卫)
     */
    function __isError(ex: any): ex is Error;
}