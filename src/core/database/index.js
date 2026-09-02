import { SqliteDB } from "./libSqlDB.js";
import { RedisClient } from "./redisDB.js";

/**
 * 数据库单例连接容器
 * @type {{ sqlite: SqliteDB|null, redis: RedisClient|null }}
 */
const db = {
    sqlite: null,
    redis: null
};

/**
 * 获取全局 SQLite (LibSQL) 数据库实例
 * @returns {SqliteDB|null} SQLite 数据库客户端实例
 */
export function getSqliteDB() {
    return db.sqlite;
}

/**
 * 获取全局 Redis 客户端实例
 * @returns {RedisClient|null} Redis 客户端实例（若未启用 Redis 配置则返回 null）
 */
export function getRedisClient() {
    return db.redis;
}

/**
 * 初始化所有数据库连接（包括 Redis 客户端与 SQLite Schema / 数据表初始化）
 * @returns {Promise<void>}
 */
export async function initializeDB() {
    // 1. Redis 初始化（根据配置按需开启）
    const redisOptions = __env.get('redis');
    if (redisOptions?.enable) {
        db.redis = new RedisClient(redisOptions);
        db.redis.initialization();
    }
    // 2. SQLite (LibSQL) 初始化（加载各模块数据表与建表 DDL）
    db.sqlite = new SqliteDB();
    await db.sqlite.initialization();
}