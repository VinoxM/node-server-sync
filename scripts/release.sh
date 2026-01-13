#!/bin/bash

# 1. 获取最新的标签 (只筛选 v 开头的标签)
# --tags: 获取所有标签
# --abbrev=0: 只要标签名，不要提交哈希
# --match "v*": 只匹配以 v 开头的标签
LATEST_TAG=$(git describe --tags --abbrev=0 --match "v*" 2>/dev/null)

# 如果没有任何 v 开头的标签，默认从 v0.0.0 开始
if [ -z "$LATEST_TAG" ]; then
    echo "未发现 v 开头的标签，将从 v0.0.1 开始。"
    NEW_TAG="v0.0.1"
else
    echo "当前最新标签: $LATEST_TAG"

    # 2. 提取版本号数字部分 (例如从 v1.2.3 提取 1.2.3)
    VERSION_NUM=${LATEST_TAG#v}

    # 3. 将版本号拆分为主版本、次版本、修订号
    # 使用 IFS 将字符串按点号拆分
    IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION_NUM"

    # 4. 修订号 (最后一位) 加 1
    NEW_PATCH=$((PATCH + 1))
    NEW_TAG="v$MAJOR.$MINOR.$NEW_PATCH"
fi

echo "生成新标签: $NEW_TAG"

# 5. 创建并推送标签
# -a: 创建带注释的标签 (建议做法)
git tag -a "$NEW_TAG" -m "Automated version bump to $NEW_TAG"

if [ $? -eq 0 ]; then
    echo "正在推送到远端仓库..."
    git push origin "$NEW_TAG"
    echo "完成！"
else
    echo "创建标签失败，可能该标签已存在。"
    exit 1
fi