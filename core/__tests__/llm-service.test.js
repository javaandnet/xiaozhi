/**
 * LLM Service 单元测试
 */

const LLMService = require('../llm-service');

describe('LLMService', () => {
  let service;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      services: {
        llm: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          api_key: 'test-key',
          base_url: 'https://api.openai.com/v1'
        }
      }
    };
    service = new LLMService(mockConfig);
  });

  describe('构造函数', () => {
    test('应该正确初始化配置', () => {
      expect(service.provider).toBe('openai');
      expect(service.model).toBe('gpt-3.5-turbo');
      expect(service.apiKey).toBe('test-key');
      expect(service.baseUrl).toBe('https://api.openai.com/v1');
    });

    test('应该使用默认配置', () => {
      const defaultService = new LLMService({});
      expect(defaultService.provider).toBe('openai');
      expect(defaultService.model).toBe('qwen-plus');
    });
  });

  describe('chat', () => {
    test('应该构建正确的消息并调用API', async () => {
      const spy = jest.spyOn(service, 'callAPI').mockResolvedValue('Hello!');
      
      const result = await service.chat('conn-1', '你好');
      
      expect(spy).toHaveBeenCalled();
      expect(result).toBe('Hello!');
      
      // 验证历史记录
      const history = service.conversationHistory.get('conn-1');
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
    });

    test('应该处理API调用错误', async () => {
      jest.spyOn(service, 'callAPI').mockRejectedValue(new Error('API错误'));
      
      await expect(service.chat('conn-1', '你好')).rejects.toThrow('API错误');
    });
  });

  describe('buildMessages', () => {
    test('应该构建包含系统提示的消息列表', () => {
      service.conversationHistory.set('conn-1', [
        { role: 'user', content: '之前的提问' },
        { role: 'assistant', content: '之前的回答' }
      ]);
      
      const messages = service.buildMessages('conn-1', '新的问题');
      
      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('之前的提问');
      expect(messages[2].content).toBe('之前的回答');
      expect(messages[3].content).toBe('新的问题');
    });
  });

  describe('addToHistory', () => {
    test('应该添加消息到历史记录', () => {
      service.addToHistory('conn-1', 'user', '你好');
      service.addToHistory('conn-1', 'assistant', '你好！有什么可以帮助你的吗？');
      
      const history = service.conversationHistory.get('conn-1');
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('你好');
      expect(history[1].content).toBe('你好！有什么可以帮助你的吗？');
    });

    test('应该限制历史记录长度', () => {
      service.maxHistoryLength = 2;
      
      // 添加超过限制的消息
      for (let i = 0; i < 5; i++) {
        service.addToHistory('conn-1', 'user', `消息${i}`);
        service.addToHistory('conn-1', 'assistant', `回复${i}`);
      }
      
      const history = service.conversationHistory.get('conn-1');
      expect(history).toHaveLength(2);
    });
  });

  describe('clearHistory', () => {
    test('应该清除指定连接的历史记录', () => {
      service.conversationHistory.set('conn-1', [{ role: 'user', content: 'test' }]);
      service.conversationHistory.set('conn-2', [{ role: 'user', content: 'test2' }]);
      
      service.clearHistory('conn-1');
      
      expect(service.conversationHistory.has('conn-1')).toBe(false);
      expect(service.conversationHistory.has('conn-2')).toBe(true);
    });
  });

  describe('isConfigured', () => {
    test('应该在有API密钥时返回true', () => {
      expect(service.isConfigured()).toBe(true);
    });

    test('应该在没有API密钥时返回false', () => {
      const unconfiguredService = new LLMService({ services: { llm: {} } });
      expect(unconfiguredService.isConfigured()).toBe(false);
    });
  });
});
