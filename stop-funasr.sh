#!/bin/bash

# FunASR Docker 停止脚本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

CONTAINER_NAME="funasr-service"

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}FunASR Docker 停止脚本${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# 检查容器是否存在
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}容器 ${CONTAINER_NAME} 不存在${NC}"
    exit 0
fi

# 检查容器是否正在运行
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}正在停止容器 ${CONTAINER_NAME}...${NC}"
    docker stop $CONTAINER_NAME
    echo -e "${GREEN}容器已停止${NC}"
else
    echo -e "${YELLOW}容器未运行${NC}"
fi

# 询问是否删除容器
read -p "是否删除容器? (y/n): " remove
if [ "$remove" = "y" ] || [ "$remove" = "Y" ]; then
    echo -e "${YELLOW}正在删除容器...${NC}"
    docker rm $CONTAINER_NAME
    echo -e "${GREEN}容器已删除${NC}"
else
    echo -e "${YELLOW}容器已保留,可使用以下命令重新启动:${NC}"
    echo -e "  ${GREEN}docker start $CONTAINER_NAME${NC}"
fi

echo ""
echo -e "${GREEN}完成!${NC}"
