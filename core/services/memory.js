const BaseService = require('./base');

class MemoryService extends BaseService {
  constructor(config = {}) {
    super('Memory', config);
  }

  async _initialize() {
    console.log('初始化记忆服务');
  }

  async _healthCheck() {
    return {
      message: '记忆服务运行正常'
    };
  }
}

module.exports = MemoryService;