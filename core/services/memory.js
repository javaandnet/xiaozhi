import BaseService from './base.js';

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

export default MemoryService;