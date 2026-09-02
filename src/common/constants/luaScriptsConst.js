/**
 * Redis Lua 脚本：授权 Token 同步与自动淘汰
 * - KEYS[1]: `user_tokens:{uid}:{clientId}` 用户在特定客户端下的活跃 Token 有序集合
 * - ARGV[1]: score (当前时间戳)
 * - ARGV[2]: hash (Token 句柄哈希)
 * - ARGV[3]: max_store (该端最大允许 Token 存储数)
 * - ARGV[4]: token (原始 JWT 文本)
 * - ARGV[5]: expire (Redis 键过期时间，单位秒)
 * 
 * 逻辑：
 * 1. 向 ZSet 插入当前 Hash 及时间戳
 * 2. 检查当前客户端 Token 总数，超过上限时按 score 升序淘汰最旧的 Hash
 * 3. 批量删除被淘汰的 `token:{hash}` 详情键与 ZSet 成员
 * 4. 设置当前 `token:{hash}` 的具体内容及 TTL 过期时间
 * @type {string}
 */
export const authorizationSyncScript = `
    -- KEYS[1]: user_tokens:{uid}
    -- ARGV[1]: score (时间戳)
    -- ARGV[2]: hash (Token 的唯一标识)
    -- ARGV[3]: max_store (最大允许设备数)
    -- ARGV[4]: token (完整的 JWT)
    -- ARGV[5]: expire (过期时间/秒)

    -- 1. 更新或插入当前 Hash
    redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])

    -- 2. 获取当前总数
    local count = redis.call('ZCARD', KEYS[1])
    local max_allowed = tonumber(ARGV[3])

    -- 3. 如果超过最大限制，一次性清理所有多余的
    if count > max_allowed then
        -- 计算需要删除的数量 (例如总共 5 个，限制 3 个，则需要删掉索引 0 到 1 的两个)
        local stop_index = count - max_allowed - 1
        
        -- 找到所有待删除的 Hashes
        local oldHashes = redis.call('ZRANGE', KEYS[1], 0, stop_index)
        
        if #oldHashes > 0 then
            -- 批量删除对应的 Token 详情
            for i, hash in ipairs(oldHashes) do
                redis.call('DEL', 'token:' .. hash)
            end
            -- 批量从 ZSet 中移除这些索引
            redis.call('ZREMRANGEBYRANK', KEYS[1], 0, stop_index)
        end
    end

    -- 4. 存储当前 Token 详情
    redis.call('SET', 'token:' .. ARGV[2], ARGV[4], 'EX', ARGV[5])
    return 1
`;

/**
 * Redis Lua 脚本：批量注销指定用户下的所有多端 Token
 * - KEYS[1]: `user_tokens:{uid}:*` 匹配该用户全部客户端的通配符 Pattern
 * 
 * 逻辑：
 * 1. 扫描所有匹配的 `user_tokens:{uid}:{clientId}` 列表 Key
 * 2. 读取各端下的全部 Hash 列表并批量删除对应的 `token:{hash}` 键
 * 3. 移除各端的 ZSet 列表 Key，返回删除的客户端 Key 数量
 * @type {string}
 */
export const deleteUserTokensScript = `
    local keys = redis.call('KEYS', KEYS[1])
    local deletedCount = 0
    for _, clientKey in ipairs(keys) do
        -- 获取该端下的所有 Hash
        local hashes = redis.call('ZRANGE', clientKey, 0, -1)
        for _, hash in ipairs(hashes) do
            -- 删除具体的 token:hash 内容
            redis.call('DEL', 'token:' .. hash)
        end
        -- 删除客户端列表 Key
        redis.call('DEL', clientKey)
        deletedCount = deletedCount + 1
    end
    return deletedCount
`;