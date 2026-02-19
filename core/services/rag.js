import { logger } from '../../utils/logger.js';
import BaseService from './base.js';
import crypto from 'crypto';

/**
 * RAG 服务 - 基于 Qdrant 向量数据库实现检索增强生成
 */
class RagService extends BaseService {
  constructor(config = {}) {
    super('RAG', config);

    // Qdrant 配置
    this.qdrantConfig = config.services?.rag?.qdrant || {};
    this.embeddingConfig = config.services?.rag?.embedding || {};
    this.searchConfig = config.services?.rag?.search || { limit: 5, scoreThreshold: 0.7 };

    // Qdrant 客户端（延迟初始化）
    this.client = null;
    this.collectionName = this.qdrantConfig.collection || 'knowledge_base';
  }

  async _initialize() {
    logger.info('初始化 RAG 服务...');

    // 动态导入 Qdrant 客户端
    try {
      const { QdrantClient } = await import('@qdrant/js-client-rest');
      this.client = new QdrantClient({
        url: this.qdrantConfig.url || 'http://localhost:6333',
        apiKey: this.qdrantConfig.apiKey || undefined
      });

      // 检查并创建集合
      await this.ensureCollection();

      logger.info('RAG 服务初始化完成');
    } catch (error) {
      logger.warn(`RAG 服务初始化失败: ${error.message}，RAG 功能将被禁用`);
      this.enabled = false;
    }
  }

  /**
   * 确保集合存在
   */
  async ensureCollection() {
    const dimension = this.embeddingConfig.dimension || 1536;

    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collectionName);

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: dimension,
            distance: 'Cosine'
          }
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
    // 使用 OpenAI 兼容 Embeddings API
    if (this.embeddingConfig.provider === 'openai') {
      if (!this.embeddingConfig.apiKey) {
        throw new Error('API Key 未配置，请在 .env 中设置 OPENAI_API_KEY');
      }

      // 支持自定义 base_url（如自己的 agent 服务）
      const baseUrl = this.embeddingConfig.baseUrl || 'https://api.openai.com/v1';
      const url = `${baseUrl}/embeddings`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.embeddingConfig.apiKey}`
        },
        body: JSON.stringify({
          model: this.embeddingConfig.model || 'text-embedding-3-small',
          input: text
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API 错误: ${error}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    }

    throw new Error(`不支持的 Embedding 提供者: ${this.embeddingConfig.provider}`);
  }

  /**
   * 生成确定性 UUID（基于字符串 ID）
   * @param {string} id - 原始 ID
   * @returns {string} UUID 格式的 ID
   */
  _generateUUID(id) {
    const hash = crypto.createHash('md5').update(id).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  }

  /**
   * 添加文档到向量库
   * @param {string} id - 文档ID
   * @param {string} content - 文档内容
   * @param {object} metadata - 元数据
   */
  async addDocument(id, content, metadata = {}) {
    if (!this.client) {
      throw new Error('RAG 服务未初始化');
    }

    try {
      const vector = await this.generateEmbedding(content);
      const uuid = this._generateUUID(id);

      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [{
          id: uuid,
          vector: vector,
          payload: {
            docId: id,
            content,
            ...metadata,
            createdAt: new Date().toISOString()
          }
        }]
      });

      logger.info(`文档已添加: ${id} (uuid: ${uuid})`);
      return { success: true, id, uuid };
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
    if (!this.client) {
      throw new Error('RAG 服务未初始化');
    }

    const points = [];

    for (const doc of documents) {
      const vector = await this.generateEmbedding(doc.content);
      const uuid = this._generateUUID(doc.id);
      points.push({
        id: uuid,
        vector: vector,
        payload: {
          docId: doc.id,
          content: doc.content,
          ...doc.metadata,
          createdAt: new Date().toISOString()
        }
      });
    }

    await this.client.upsert(this.collectionName, {
      wait: true,
      points: points
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
    if (!this.client) {
      throw new Error('RAG 服务未初始化');
    }

    const limit = options.limit || this.searchConfig.limit;
    const scoreThreshold = options.scoreThreshold || this.searchConfig.scoreThreshold;

    try {
      const queryVector = await this.generateEmbedding(query);

      const results = await this.client.search(this.collectionName, {
        vector: queryVector,
        limit: limit,
        score_threshold: scoreThreshold
      });

      logger.info(`RAG 搜索: "${query.substring(0, 20)}..." 找到 ${results.length} 条结果`);

      return results.map(r => ({
        id: r.payload.docId || r.id,
        score: r.score,
        content: r.payload.content,
        metadata: r.payload
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
    if (!this.client) {
      throw new Error('RAG 服务未初始化');
    }

    const uuid = this._generateUUID(id);
    await this.client.delete(this.collectionName, {
      wait: true,
      points: [uuid]
    });
    logger.info(`文档已删除: ${id}`);
  }

  /**
   * 清空集合
   */
  async clearCollection() {
    if (!this.client) {
      throw new Error('RAG 服务未初始化');
    }

    await this.client.deleteCollection(this.collectionName);
    await this.ensureCollection();
    logger.info(`集合已清空: ${this.collectionName}`);
  }

  /**
   * 获取集合统计
   */
  async getStats() {
    if (!this.client) {
      throw new Error('RAG 服务未初始化');
    }

    const info = await this.client.getCollection(this.collectionName);
    return {
      vectorCount: info.points_count,
      indexedVectors: info.indexed_vectors_count,
      status: info.status
    };
  }

  async _healthCheck() {
    try {
      if (!this.client) {
        return {
          status: 'disabled',
          message: 'RAG 服务未启用或初始化失败'
        };
      }

      const stats = await this.getStats();
      return {
        message: 'RAG 服务运行正常',
        collection: this.collectionName,
        ...stats
      };
    } catch (error) {
      throw new Error(`RAG 服务健康检查失败: ${error.message}`);
    }
  }
}

export default RagService;