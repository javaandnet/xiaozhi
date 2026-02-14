const BaseService = require('./base');

class VadService extends BaseService {
  constructor(config = {}) {
    super('VAD', config);
  }

  async _initialize() {
    console.log('初始化VAD服务');
  }

  async _healthCheck() {
    return {
      message: 'VAD服务运行正常'
    };
  }
}

module.exports = VadService;