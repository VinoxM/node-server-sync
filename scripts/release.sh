#!/bin/bash

# 定义颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # 无颜色

# 检查当前分支是否有未提交的修改 (可选，但建议)
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}错误: 当前工作区有未提交的修改，请先提交或暂存后再发布。${NC}"
    exit 1
fi

# 1. 获取最新的标签
LATEST_TAG=$(git describe --tags --abbrev=0 --match "v*" 2>/dev/null)

if [ -z "$LATEST_TAG" ]; then
    echo "未发现 v 开头的标签，将从 v0.0.1 开始。"
    NEW_TAG="v0.0.1"
else
    echo -e "当前最新标签: ${GREEN}$LATEST_TAG${NC}"
    VERSION_NUM=${LATEST_TAG#v}
    IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION_NUM"
    NEW_PATCH=$((PATCH + 1))
    NEW_TAG="v$MAJOR.$MINOR.$NEW_PATCH"
fi

echo -e "生成新标签: ${GREEN}$NEW_TAG${NC}"

# 2. 创建标签
if git tag -a "$NEW_TAG" -m "Automated version bump to $NEW_TAG"; then
    echo "正在推送到远端仓库..."
    # 3. 推送标签，并判断推送是否成功
    if git push origin "$NEW_TAG"; then
        echo -e "${GREEN}发布完成！${NC}"
    else
        echo -e "${RED}错误: 推送到远端失败，请检查网络或权限。${NC}"
        exit 1
    fi
else
    echo -e "${RED}错误: 创建标签失败。可能是标签 $NEW_TAG 已在本地存在。${NC}"
    read -p "按回车键关闭..."
    exit 1
fi