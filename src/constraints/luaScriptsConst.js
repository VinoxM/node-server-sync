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
`