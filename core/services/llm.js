const BaseService = require('./base');
const { logger } = require('../../utils/logger');

class LlmService extends BaseService {
  constructor(config = {}) {
    super('LLM', config);
    
    // 优先使用config.services.llm配置（兼容llm-service.js的配置方式）
    this.llmConfig = config.services?.llm || {};
    
    // 配置参数 - 支持两种配置方式
    this.provider = this.llmConfig.provider || config.provider || 'glm';
    this.model = this.llmConfig.model || config.model || 'glm-4-flash';
    this.apiKey = this.llmConfig.api_key || config.api_key || '';
    this.baseUrl = this.llmConfig.base_url || config.base_url || 'https://open.bigmodel.cn/api/paas/v4';
    this.temperature = this.llmConfig.temperature || config.temperature || 0.7;
    this.maxTokens = this.llmConfig.max_tokens || config.max_tokens || 500;
    
    this.maxHistoryLength = 10; // 最大历史对话轮数
    this.conversationHistory = new Map(); // 存储每个连接的对话历史
  }

  async _initialize() {
    logger.info(`初始化LLM服务: ${this.provider} - ${this.model}`);
    
    // 验证配置
    if (!this.apiKey) {
      logger.warn('LLM API Key未配置，将使用模拟回复');
    }
  }

  /**
   * 聊天接口 - 生成AI回复
   * @param {string} connectionId - 连接ID
   * @param {string} message - 用户消息
   * @returns {Promise<string>} AI回复内容
   */
  async chat(connectionId, message) {
    try {
      // 构建消息列表
      const messages = this.buildMessages(connectionId, message);
      
      // 调用API
      const response = await this.callAPI(messages);
      
      // 保存对话历史
      this.addToHistory(connectionId, 'user', message);
      this.addToHistory(connectionId, 'assistant', response);
      
      logger.info(`LLM生成回复: ${message.substring(0, 20)}... -> ${response.substring(0, 20)}...`);
      return response;
    } catch (error) {
      logger.error(`LLM调用失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 构建消息列表
   * @param {string} connectionId - 连接ID
   * @param {string} newMessage - 新消息
   * @returns {Array} 消息数组
   */
  buildMessages(connectionId, newMessage) {
    const messages = [];
    
    // 添加系统提示
    messages.push({
      role: 'system',
      content: '你是小智，一个友好、智能的AI助手。请用中文回复用户的问题，回答要简洁明了。'
    });
    
    // 添加历史对话
    const history = this.conversationHistory.get(connectionId) || [];
    messages.push(...history);
    
    // 添加新消息
    messages.push({
      role: 'user',
      content: newMessage
    });
    
    return messages;
  }

  /**
   * 调用LLM API
   * @param {Array} messages - 消息列表
   * @returns {Promise<string>} 回复内容
   */
  async callAPI(messages) {
    // 如果没有配置API Key，使用模拟回复
    if (!this.apiKey) {
      logger.warn('LLM API Key未配置，使用模拟回复');
      return this.generateMockResponse(messages[messages.length - 1].content);
    }

    const url = `${this.baseUrl}/chat/completions`;
    
    const body = {
      model: this.model,
      messages: messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens
    };

    try {
      logger.debug(`调用LLM API: ${this.provider} - ${this.model}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body),
        timeout: 30000 // 30秒超时
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`LLM API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].message.content;
        logger.debug(`LLM API调用成功，回复长度: ${content.length}`);
        return content;
      }
      
      logger.error('LLM API返回格式错误:', JSON.stringify(data));
      throw new Error('API返回格式错误');
      
    } catch (error) {
      logger.error(`LLM API调用异常: ${error.message}`);
      
      // 网络错误或其他异常时回退到模拟回复
      if (error.name === 'TypeError' || error.name === 'FetchError') {
        logger.warn('网络连接失败，使用模拟回复');
        return this.generateMockResponse(messages[messages.length - 1].content);
      }
      
      throw error;
    }
  }

  /**
   * 生成模拟回复（当API不可用时）
   * @param {string} userMessage - 用户消息
   * @returns {string} 模拟回复
   */
  generateMockResponse(userMessage) {
    const responses = [
      `我听到了你说的"${userMessage}"。有什么我可以帮助你的吗？`,
      `好的，我知道了。关于"${userMessage}"，我可以为你提供更多详细信息。`,
      `收到！你说的"${userMessage}"很有意思，让我想想怎么帮你。`,
      `我在听呢！关于"${userMessage}"这个问题，我觉得...`,
      `明白！你提到"${userMessage}"，这让我想到...`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * 添加到对话历史
   * @param {string} connectionId - 连接ID
   * @param {string} role - 角色(user/assistant)
   * @param {string} content - 内容
   */
  addToHistory(connectionId, role, content) {
    if (!this.conversationHistory.has(connectionId)) {
      this.conversationHistory.set(connectionId, []);
    }
    
    const history = this.conversationHistory.get(connectionId);
    history.push({ role, content });
    
    // 限制历史长度
    if (history.length > this.maxHistoryLength * 2) { // 每轮对话包含user和assistant两条消息
      history.splice(0, 2); // 移除最老的一轮对话
    }
  }

  /**
   * 清除对话历史
   * @param {string} connectionId - 连接ID
   */
  clearHistory(connectionId) {
    this.conversationHistory.delete(connectionId);
    logger.info(`清除连接 ${connectionId} 的对话历史`);
  }

  /**
   * 获取对话历史
   * @param {string} connectionId - 连接ID
   * @returns {Array} 对话历史
   */
  getHistory(connectionId) {
    return this.conversationHistory.get(connectionId) || [];
  }

  /**
   * 检查配置是否有效
   * @returns {boolean} 是否配置有效
   */
  isConfigured() {
    return !!this.apiKey;
  }

  async _healthCheck() {
    try {
      // 测试简单对话
      const testResponse = await this.chat('health_check', '你好');
      return {
        message: 'LLM服务运行正常',
        provider: this.provider,
        model: this.model,
        configured: this.isConfigured(),
        testResponse: testResponse.substring(0, 50) + '...'
      };
    } catch (error) {
      throw new Error(`LLM服务健康检查失败: ${error.message}`);
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      activeSessions: this.conversationHistory.size,
      totalMessages: Array.from(this.conversationHistory.values()).reduce((sum, history) => sum + history.length, 0),
      provider: this.provider,
      model: this.model,
      configured: this.isConfigured()
    };
  }
}

module.exports = LlmService;

module.exports = LlmService;