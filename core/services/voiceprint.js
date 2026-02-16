import BaseService from './base.js';

class VoiceprintService extends BaseService {
  constructor(config = {}) {
    super('Voiceprint', config);
  }

  async _initialize() {
    console.log('初始化声纹服务');
  }

  async _healthCheck() {
    return {
      message: '声纹服务运行正常'
    };
  }
}

export default VoiceprintService;