#!/bin/bash

# FunASR 启动脚本 - 基于 xiaozhi-server/config.yaml 配置
# 使用在线版本镜像和 2pass 模式

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

CONTAINER_NAME="funasr-service"
IMAGE_NAME="registry.cn-hangzhou.aliyuncs.com/funasr_repo/funasr:funasr-runtime-sdk-online-cpu-0.1.12"
HOST_PORT=10096
CONTAINER_PORT=10095
MODELS_DIR="$(pwd)/funasr-runtime-resources/models"

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}FunASR 服务启动${NC}"
echo -e "${GREEN}2pass 模式 (SenseVoice + Paraformer)${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${YELLOW}参考: xiaozhi-server/config.yaml L347-352${NC}"
echo ""

# 清理旧容器
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}删除旧容器...${NC}"
    docker rm -f $CONTAINER_NAME 2>/dev/null || true
fi

# 检查模型目录
if [ ! -d "$MODELS_DIR" ]; then
    echo -e "${YELLOW}创建模型目录...${NC}"
    mkdir -p "$MODELS_DIR"
fi

echo -e "${GREEN}启动 Docker 容器...${NC}"
echo -e "${YELLOW}镜像: $IMAGE_NAME${NC}"
echo -e "${YELLOW}端口: $HOST_PORT -> $CONTAINER_PORT${NC}"
docker run -d \
    --name $CONTAINER_NAME \
    -p $HOST_PORT:$CONTAINER_PORT \
    --privileged=true \
    -v "$MODELS_DIR:/workspace/models" \
    $IMAGE_NAME \
    tail -f /dev/null

echo -e "${GREEN}容器启动成功,等待初始化...${NC}"
sleep 3

# 在容器内启动 FunASR 服务
echo -e "${GREEN}启动 FunASR 服务 (2pass 模式)...${NC}"
echo -e "${YELLOW}模型配置:${NC}"
echo -e "  VAD: damo/speech_fsmn_vad_zh-cn-16k-common-onnx"
echo -e "  主模型: iic/SenseVoiceSmall-onnx"
echo -e "  在线模型: damo/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online-onnx"
echo -e "  标点: damo/punc_ct-transformer_zh-cn-common-vad_realtime-vocab272727-onnx"
echo -e "  ITN: thuduj12/fst_itn_zh"
echo ""

docker exec -d $CONTAINER_NAME bash -c "
    cd /workspace/FunASR/runtime && \
    nohup bash run_server_2pass.sh \
        --download-model-dir /workspace/models \
        --vad-dir damo/speech_fsmn_vad_zh-cn-16k-common-onnx \
        --model-dir iic/SenseVoiceSmall-onnx \
        --online-model-dir damo/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online-onnx \
        --punc-dir damo/punc_ct-transformer_zh-cn-common-vad_realtime-vocab272727-onnx \
        --lm-dir damo/speech_ngram_lm_zh-cn-ai-wesp-fst \
        --itn-dir thuduj12/fst_itn_zh \
        --hotword /workspace/models/hotwords.txt \
        --certfile '' \
        --keyfile '' \
        > /workspace/log.txt 2>&1 &
"

echo -e "${YELLOW}等待服务启动 (约 30-60 秒加载模型)...${NC}"

# 等待服务启动
for i in {1..90}; do
    sleep 1
    
    # 检查容器是否还在运行
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}✗ 容器已退出${NC}"
        echo ""
        echo -e "${YELLOW}查看日志:${NC}"
        docker logs $CONTAINER_NAME 2>&1 | tail -50
        exit 1
    fi
    
    # 检查服务进程是否在运行
    if docker exec $CONTAINER_NAME ps aux 2>/dev/null | grep -q "funasr-wss-server.*$CONTAINER_PORT"; then
        echo -e "${GREEN}✓ 服务进程已启动${NC}"
        break
    fi
    
    if [ $((i % 10)) -eq 0 ]; then
        echo -e "${YELLOW}  等待中... ${i}s${NC}"
    fi
done

sleep 2

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}服务状态${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# 检查进程
if docker exec $CONTAINER_NAME ps aux 2>/dev/null | grep -q "funasr-wss-server.*$CONTAINER_PORT"; then
    echo -e "${GREEN}✓ 服务进程运行正常${NC}"
    
    # 显示最近日志
    echo ""
    echo -e "${YELLOW}服务日志 (最近30行):${NC}"
    docker exec $CONTAINER_NAME tail -30 /workspace/log.txt 2>/dev/null || echo "日志暂未生成"
else
    echo -e "${RED}✗ 服务进程未找到${NC}"
    echo ""
    echo -e "${YELLOW}容器日志:${NC}"
    docker logs $CONTAINER_NAME 2>&1 | tail -50
    exit 1
fi

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✓ FunASR 服务启动成功!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "容器名: ${YELLOW}$CONTAINER_NAME${NC}"
echo -e "服务端口: ${YELLOW}ws://localhost:$HOST_PORT${NC}"
echo -e "镜像版本: ${YELLOW}online-cpu-0.1.12${NC}"
echo -e "模式: ${YELLOW}2pass (离线+在线)${NC}"
echo ""
echo -e "${YELLOW}常用命令:${NC}"
echo -e "  查看日志: ${GREEN}docker exec $CONTAINER_NAME tail -f /workspace/log.txt${NC}"
echo -e "  查看进程: ${GREEN}docker exec $CONTAINER_NAME ps aux | grep funasr${NC}"
echo -e "  停止服务: ${GREEN}docker stop $CONTAINER_NAME${NC}"
echo -e "  删除容器: ${GREEN}docker rm -f $CONTAINER_NAME${NC}"
echo -e "  进入容器: ${GREEN}docker exec -it $CONTAINER_NAME bash${NC}"
echo ""
echo -e "${YELLOW}测试服务:${NC}"
echo -e "  ${GREEN}STT_PROVIDER=funasr FUNASR_HOST=localhost FUNASR_PORT=$HOST_PORT node test/stt-test.js${NC}"
echo ""
echo -e "${YELLOW}环境变量配置 (.env):${NC}"
echo -e "  STT_PROVIDER=funasr"
echo -e "  FUNASR_HOST=localhost"
echo -e "  FUNASR_PORT=$HOST_PORT"
echo ""
