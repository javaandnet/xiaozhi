import BaseService from './base.js';

class IntentService extends BaseService {
  constructor(config = {}) {
    super('Intent', config);
  }

  async _initialize() {
    console.log('初始化意图服务');
  }

  async _healthCheck() {
    return {
      message: '意图服务运行正常'
    };
  }
}

export default IntentService;