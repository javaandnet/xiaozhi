# Node.js 项目集成 Qdrant RAG 服务配置说明

本文档说明如何在 xiaozhi-server 项目中集成 Qdrant 向量数据库实现 RAG 检索增强功能。

---

## 一、Qdrant 部署

### 1.1 Docker 部署（推荐）

```bash
# 创建数据目录
mkdir -p ./data/qdrant

# 启动 Qdrant（内存限制 1GB）
docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  -v $(pwd)/data/qdrant:/qdrant/storage \
  --memory="1g" \
  qdrant/qdrant:latest
```

### 1.2 Docker Compose 部署

在项目根目录创建 `docker-compose.qdrant.yml`：

```yaml
version: "3.8"

services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: xiaozhi-qdrant
    ports:
      - "6333:6333" # REST API
      - "6334:6334" # gRPC API
    volumes:
      - ./data/qdrant:/qdrant/storage
    environment:
      - QDRANT__SERVICE__GRPC_PORT=6334
    deploy:
      resources:
        limits:
          memory: 1G
    restart: unless-stopped
```

启动命令：

```bash
docker-compose -f docker-compose.qdrant.yml up -d
```

### 1.3 验证部署

```bash
# 检查服务状态
curl http://localhost:6333/health

# 预期返回
{"title":"qdrant - vector search engine","version":"1.x.x"}
```

---

## 二、Node.js 依赖安装

### 2.1 安装 Qdrant 客户端

```bash
npm install @qdrant/js-client-rest
```

### 2.2 安装 Embedding 依赖（可选）

如需本地生成向量：

```bash
# 使用 OpenAI Embeddings
npm install openai

# 或使用 HuggingFace Transformers（本地）
npm install @xenova/transformers
```

---

## 三、环境变量配置

### 3.1 更新 .env 文件

在 `.env` 中添加以下配置：

```env
# Qdrant 配置
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                    # 云服务时需要，本地部署留空
QDRANT_COLLECTION=knowledge_base   # 集合名称

# Embedding 配置
EMBEDDING_PROVIDER=openai          # openai / local
OPENAI_API_KEY=sk-xxx              # OpenAI API Key
EMBEDDING_MODEL=text-embedding-3-small  # 向量模型
```

### 3.2 更新 .env.example

同步更新示例文件：

```env
# Qdrant 向量数据库配置
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=knowledge_base

# Embedding 配置
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
```

---

## 四、配置文件更新

### 4.1 更新 config/index.js

在 `services` 配置中添加 `rag` 配置块：

```javascript
// 服务配置
services: {
  // ... 现有配置 ...

  // RAG 服务配置
  rag: {
    enabled: process.env.RAG_ENABLED === 'true' || false,
    qdrant: {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY || '',
      collection: process.env.QDRANT_COLLECTION || 'knowledge_base'
    },
    embedding: {
      provider: process.env.EMBEDDING_PROVIDER || 'openai',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY || '',
      dimension: 1536  // text-embedding-3-small 维度
    },
    search: {
      limit: parseInt(process.env.RAG_SEARCH_LIMIT) || 5,      // 返回结果数
      scoreThreshold: parseFloat(process.env.RAG_SCORE_THRESHOLD) || 0.7  // 相似度阈值
    }
  }
}
```

---

## 五、代码实现

### 5.1 更新 RagService

更新 `core/services/rag.js`：

```javascript
import BaseService from "./base.js";
import { QdrantClient } from "@qdrant/js-client-rest";
import { logger } from "../../utils/logger.js";

class RagService extends BaseService {
  constructor(config = {}) {
    super("RAG", config);

    // Qdrant 配置
    this.qdrantConfig = config.services?.rag?.qdrant || {};
    this.embeddingConfig = config.services?.rag?.embedding || {};
    this.searchConfig = config.services?.rag?.search || {
      limit: 5,
      scoreThreshold: 0.7,
    };

    // 初始化客户端
    this.client = null;
    this.collectionName = this.qdrantConfig.collection || "knowledge_base";
  }

  async _initialize() {
    logger.info("初始化 RAG 服务...");

    // 初始化 Qdrant 客户端
    this.client = new QdrantClient({
      url: this.qdrantConfig.url || "http://localhost:6333",
      apiKey: this.qdrantConfig.apiKey || undefined,
    });

    // 检查并创建集合
    await this.ensureCollection();

    logger.info("RAG 服务初始化完成");
  }

  /**
   * 确保集合存在
   */
  async ensureCollection() {
    const dimension = this.embeddingConfig.dimension || 1536;

    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === this.collectionName
      );

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: dimension,
            distance: "Cosine",
          },
        });
        logger.info(`创建 Qdrant 集合: ${this.collectionName}`);
      }
    } catch (error) {
      logger.error(`检查/创建集合失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 生成文本向量
   * @param {string} text - 输入文本
   * @returns {Promise<number[]>} 向量数组
   */
  async generateEmbedding(text) {
    // 使用 OpenAI Embeddings
    if (this.embeddingConfig.provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.embeddingConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: this.embeddingConfig.model || "text-embedding-3-small",
          input: text,
        }),
      });

      const data = await response.json();
      return data.data[0].embedding;
    }

    // TODO: 支持其他 embedding 提供者
    throw new Error(
      `不支持的 Embedding 提供者: ${this.embeddingConfig.provider}`
    );
  }

  /**
   * 添加文档到向量库
   * @param {string} id - 文档ID
   * @param {string} content - 文档内容
   * @param {object} metadata - 元数据
   */
  async addDocument(id, content, metadata = {}) {
    try {
      const vector = await this.generateEmbedding(content);

      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: id,
            vector: vector,
            payload: {
              content,
              ...metadata,
              createdAt: new Date().toISOString(),
            },
          },
        ],
      });

      logger.info(`文档已添加: ${id}`);
      return { success: true, id };
    } catch (error) {
      logger.error(`添加文档失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 批量添加文档
   * @param {Array<{id: string, content: string, metadata?: object}>} documents
   */
  async addDocuments(documents) {
    const points = [];

    for (const doc of documents) {
      const vector = await this.generateEmbedding(doc.content);
      points.push({
        id: doc.id,
        vector: vector,
        payload: {
          content: doc.content,
          ...doc.metadata,
          createdAt: new Date().toISOString(),
        },
      });
    }

    await this.client.upsert(this.collectionName, {
      wait: true,
      points: points,
    });

    logger.info(`批量添加 ${documents.length} 个文档`);
    return { success: true, count: documents.length };
  }

  /**
   * 搜索相似文档
   * @param {string} query - 查询文本
   * @param {object} options - 搜索选项
   * @returns {Promise<Array>} 搜索结果
   */
  async search(query, options = {}) {
    const limit = options.limit || this.searchConfig.limit;
    const scoreThreshold =
      options.scoreThreshold || this.searchConfig.scoreThreshold;

    try {
      const queryVector = await this.generateEmbedding(query);

      const results = await this.client.search(this.collectionName, {
        vector: queryVector,
        limit: limit,
        score_threshold: scoreThreshold,
      });

      logger.info(
        `RAG 搜索: "${query.substring(0, 20)}..." 找到 ${results.length} 条结果`
      );

      return results.map((r) => ({
        id: r.id,
        score: r.score,
        content: r.payload.content,
        metadata: r.payload,
      }));
    } catch (error) {
      logger.error(`RAG 搜索失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 删除文档
   * @param {string} id - 文档ID
   */
  async deleteDocument(id) {
    await this.client.delete(this.collectionName, {
      wait: true,
      points: [id],
    });
    logger.info(`文档已删除: ${id}`);
  }

  /**
   * 清空集合
   */
  async clearCollection() {
    await this.client.deleteCollection(this.collectionName);
    await this.ensureCollection();
    logger.info(`集合已清空: ${this.collectionName}`);
  }

  /**
   * 获取集合统计
   */
  async getStats() {
    const info = await this.client.getCollection(this.collectionName);
    return {
      vectorCount: info.points_count,
      indexedVectors: info.indexed_vectors_count,
      status: info.status,
    };
  }

  async _healthCheck() {
    try {
      const stats = await this.getStats();
      return {
        message: "RAG 服务运行正常",
        collection: this.collectionName,
        ...stats,
      };
    } catch (error) {
      throw new Error(`RAG 服务健康检查失败: ${error.message}`);
    }
  }
}

export default RagService;
```

### 5.2 使用示例

```javascript
// 在其他服务中使用 RAG
import RagService from "./services/rag.js";
import config from "./config/index.js";

// 初始化
const ragService = new RagService(config);
await ragService.initialize();

// 添加文档
await ragService.addDocument("doc-001", "这是公司的报销制度说明...", {
  category: "财务",
  department: "人事部",
});

// 批量添加
await ragService.addDocuments([
  { id: "doc-002", content: "请假流程...", metadata: { category: "人事" } },
  { id: "doc-003", content: "会议室预约...", metadata: { category: "行政" } },
]);

// 搜索
const results = await ragService.search("如何报销差旅费");
console.log(results);
// [{ id: 'doc-001', score: 0.92, content: '这是公司的报销制度说明...', metadata: {...} }]
```

### 5.3 与 LLM 服务集成

```javascript
// 在聊天流程中集成 RAG
async function chatWithRAG(connectionId, message) {
  // 1. 判断是否需要 RAG 检索
  const needRAG = await classifyQuery(message);

  let context = "";
  if (needRAG) {
    // 2. 检索相关文档
    const results = await ragService.search(message);
    context = results.map((r) => r.content).join("\n\n");
  }

  // 3. 构建带上下文的提示
  const prompt = context
    ? `参考资料：\n${context}\n\n问题：${message}\n\n请基于参考资料回答。`
    : message;

  // 4. 调用 LLM
  return llmService.chat(connectionId, prompt);
}
```

---

## 六、API 接口

### 6.1 添加文档接口

```http
POST /api/rag/documents
Content-Type: application/json

{
  "id": "doc-001",
  "content": "文档内容...",
  "metadata": {
    "category": "财务",
    "source": "内部制度"
  }
}
```

### 6.2 搜索接口

```http
GET /api/rag/search?q=如何报销&limit=5

Response:
{
  "success": true,
  "results": [
    {
      "id": "doc-001",
      "score": 0.92,
      "content": "报销制度说明...",
      "metadata": { "category": "财务" }
    }
  ]
}
```

---

## 七、性能优化

### 7.1 开启向量量化（降低内存 90%）

```javascript
await client.updateCollection(collectionName, {
  vectors: {
    on_disk: true, // 向量存储到磁盘
  },
  quantization_config: {
    scalar: {
      type: "int8",
      quantile: 0.99,
      always_ram: true,
    },
  },
});
```

### 7.2 批量导入优化

```javascript
// 使用批量导入，每批 100 个
const batchSize = 100;
for (let i = 0; i < documents.length; i += batchSize) {
  const batch = documents.slice(i, i + batchSize);
  await ragService.addDocuments(batch);
}
```

---

## 八、常见问题

### Q1: Qdrant 连接失败？

```bash
# 检查服务状态
docker ps | grep qdrant
curl http://localhost:6333/health

# 检查端口占用
lsof -i :6333
```

### Q2: 向量维度不匹配？

确保 Embedding 模型的维度与集合配置一致：

| 模型                   | 维度 |
| ---------------------- | ---- |
| text-embedding-3-small | 1536 |
| text-embedding-3-large | 3072 |
| text-embedding-ada-002 | 1536 |

### Q3: 内存不足？

1. 开启向量量化
2. 启用磁盘存储 `on_disk: true`
3. 限制 Qdrant 容器内存

---

## 九、资源需求参考

| 文档数量 | 向量数量 | 内存需求 | 磁盘空间 |
| -------- | -------- | -------- | -------- |
| 1,000    | ~5,000   | ~50MB    | ~100MB   |
| 5,000    | ~25,000  | ~200MB   | ~500MB   |
| 10,000   | ~50,000  | ~400MB   | ~1GB     |
| 50,000   | ~250,000 | ~2GB     | ~5GB     |

**4GB 内存服务器可轻松支持 10,000+ 文档。**
