const BaseService = require('./base');

class LlmService extends BaseService {
  constructor(config = {}) {
    super('LLM', config);
  }

  async _initialize() {
    console.log('初始化LLM服务');
  }

  async _healthCheck() {
    return {
      message: 'LLM服务运行正常'
    };
  }
}

module.exports = LlmService;