#!/bin/bash
WORK_SPACE=$(cd $(dirname "${BASH_SOURCE[0]}")/.. && pwd)
FILE_PATH="$WORK_SPACE/src/application.js"
LOG_PATH="$WORK_SPACE/log/out.log"
ENV_FILE="$(dirname "${BASH_SOURCE[0]}")/.env"

# 初始化环境变量参数字符串
ENV_ARGS=""

# 检查.env文件是否存在
if [ -f "$ENV_FILE" ]; then
    # 读取.env文件，过滤掉空行和注释行
    while IFS= read -r line || [ -n "$line" ]; do
        # 跳过空行和注释行
        [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
        
        # 提取key和value
        key="${line%%=*}"
        value="${line#*=}"
        
        # 移除可能的空格
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        
        # 添加到参数列表
        if [[ -n "$key" && -n "$value" ]]; then
            ENV_ARGS="$ENV_ARGS --$key=$value"
        fi
    done < "$ENV_FILE"
    
    echo "Loaded environment variables from $ENV_FILE"
fi

# 执行命令
nohup node $FILE_PATH $ENV_ARGS > $LOG_PATH &