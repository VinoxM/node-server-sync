import { SqliteDB } from "./sqliteDB.js";
import { RedisClient } from "./redisDB.js";

const db = {
    sqlite: null,
    redis: null
}

export function getSqliteDB() {
    return db.sqlite;
}

export function getRedisClient() {
    return db.redis;
}

export async function initializeDB() {
    // redis initialize
    const redisOptions = __env.get('redis')
    if (redisOptions?.enable) {
        db.redis = new RedisClient(redisOptions)
        await db.redis.initialization()
    }
    // sqlite initialize
    db.sqlite = new SqliteDB()
    await db.sqlite.initialization()
}