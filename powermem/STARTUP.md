# PowerMem 启动说明

## 服务概览

| 服务              | 端口  | 说明            |
| ----------------- | ----- | --------------- |
| PowerMem HTTP API | 9902  | 智能记忆服务    |
| OceanBase         | 2881  | 数据库          |
| Ollama            | 11434 | LLM & Embedding |

## 启动步骤

### 1. 启动 Docker Desktop

```bash
open -a Docker
```

等待 Docker 完全启动（约 30 秒）。

### 2. 启动 OceanBase

```bash
cd /Users/fengleiren/git/xiaozhi/powermem
docker-compose up -d
```

等待 OceanBase 初始化完成（约 60 秒），验证：

```bash
docker exec oceanbase obclient -h127.0.0.1 -P2881 -uroot@test -e "SELECT 1"
```

### 3. 启动 Ollama

```bash
ollama serve
```

确保模型已下载：

```bash
# LLM 模型（如未下载）
ollama pull gpt-oss:120b-cloud

# Embedding 模型
ollama pull nomic-embed-text
```

### 4. 启动 PowerMem Server

```bash
cd /Users/fengleiren/git/xiaozhi/powermem
powermem-server --host 0.0.0.0 --port 9902
```

## 验证服务

```bash
# 健康检查
curl http://localhost:9902/api/v1/system/health

# 系统状态
curl http://localhost:9902/api/v1/system/status

# 添加记忆
curl -X POST http://localhost:9902/api/v1/memories \
  -H "Content-Type: application/json" \
  -d '{"content": "测试记忆内容", "user_id": "user1"}'

# 搜索记忆
curl -X POST http://localhost:9902/api/v1/memories/search \
  -H "Content-Type: application/json" \
  -d '{"query": "测试", "user_id": "user1"}'
```

## 配置文件

配置文件位于：`.env`

关键配置项：

```env
# 数据库
DATABASE_PROVIDER=oceanbase
OCEANBASE_HOST=127.0.0.1
OCEANBASE_PORT=2881
OCEANBASE_USER=root@test
OCEANBASE_PASSWORD=
OCEANBASE_DATABASE=powermem
OCEANBASE_COLLECTION=memories_768

# LLM (Ollama)
LLM_PROVIDER=ollama
LLM_MODEL=gpt-oss:120b-cloud
OLLAMA_BASE_URL=http://localhost:11434

# Embedding (Ollama)
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMS=768

# HTTP Server
POWERMEM_SERVER_HOST=0.0.0.0
POWERMEM_SERVER_PORT=9902
POWERMEM_SERVER_AUTH_ENABLED=false
```

## 常见问题

### OceanBase 连接失败

```bash
# 检查容器状态
docker ps | grep oceanbase

# 查看日志
docker logs oceanbase

# 重启容器
docker-compose restart
```

### Ollama 模型未找到

```bash
# 查看已安装模型
ollama list

# 拉取模型
ollama pull nomic-embed-text
```

### 向量维度不匹配

如果更换 Embedding 模型，需要更改 collection 名称：

```env
OCEANBASE_COLLECTION=memories_新维度
```

## API 文档

访问 http://localhost:9902/docs 查看完整 API 文档。
