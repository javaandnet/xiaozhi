import BaseService from './base.js';

class McpService extends BaseService {
  constructor(config = {}) {
    super('MCP', config);
  }

  async _initialize() {
    console.log('初始化MCP服务');
  }

  async _healthCheck() {
    return {
      message: 'MCP服务运行正常'
    };
  }
}

export default McpService;