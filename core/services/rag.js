const BaseService = require('./base');

class RagService extends BaseService {
  constructor(config = {}) {
    super('RAG', config);
  }

  async _initialize() {
    console.log('初始化RAG服务');
  }

  async _healthCheck() {
    return {
      message: 'RAG服务运行正常'
    };
  }
}

module.exports = RagService;