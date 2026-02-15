/**
 * BaseService 模拟模块
 */

class BaseService {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.enabled = config.enabled !== false;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return true;
    }
    try {
      await this._initialize();
      this.initialized = true;
      return true;
    } catch (error) {
      throw error;
    }
  }

  async _initialize() {
    // 默认空实现
  }

  async destroy() {
    if (!this.initialized) {
      return;
    }
    try {
      await this._destroy();
      this.initialized = false;
    } catch (error) {
      throw error;
    }
  }

  async _destroy() {
    // 默认空实现
  }

  isEnabled() {
    return this.enabled && this.initialized;
  }

  getConfig() {
    return this.config;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  async healthCheck() {
    if (!this.initialized) {
      return { status: 'uninitialized', message: '服务未初始化' };
    }
    try {
      const result = await this._healthCheck();
      return { status: 'healthy', ...result };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async _healthCheck() {
    return { message: '服务运行正常' };
  }
}

module.exports = BaseService;
