const { logger } = require('../utils/logger');

/**
 * LLM服务 - 调用大语言模型API
 */
class LLMService {
  constructor(config) {
    this.config = config;
    this.llmConfig = config.services?.llm || {};
    this.provider = this.llmConfig.provider || 'openai';
    this.model = this.llmConfig.model || 'qwen-plus';
    this.apiKey = this.llmConfig.api_key || '';
    this.baseUrl = this.llmConfig.base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.temperature = this.llmConfig.temperature || 0.7;
    this.maxTokens = this.llmConfig.max_tokens || 500;
    
    // 对话历史
    this.conversationHistory = new Map(); // connectionId -> [{role, content}]
    this.maxHistoryLength = 10;
  }

  /**
   * 发送聊天请求
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
      
      return response;
    } catch (error) {
      logger.error(`LLM调用失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 构建消息列表
   */
  buildMessages(connectionId, newMessage) {
    const messages = [];
    
    // 添加系统提示
    messages.push({
      role: 'system',
      content: '你是小智，一个友好、智能的AI助手。请用中文回复用户的问题。'
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
   */
  async callAPI(messages) {
    const url = `${this.baseUrl}/chat/completions`;
    
    const body = {
      model: this.model,
      messages: messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    }
    
    throw new Error('API返回格式错误');
  }

  /**
   * 添加到对话历史
   */
  addToHistory(connectionId, role, content) {
    if (!this.conversationHistory.has(connectionId)) {
      this.conversationHistory.set(connectionId, []);
    }
    
    const history = this.conversationHistory.get(connectionId);
    history.push({ role, content });
    
    // 限制历史长度
    if (history.length > this.maxHistoryLength) {
      history.shift(); // 移除最老的系统消息
      history.shift(); // 移除最老的用户消息
    }
  }

  /**
   * 清除对话历史
   */
  clearHistory(connectionId) {
    this.conversationHistory.delete(connectionId);
  }

  /**
   * 检查配置是否有效
   */
  isConfigured() {
    return !!this.apiKey;
  }
}

module.exports = LLMService;
