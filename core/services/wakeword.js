const BaseService = require('./base');

class WakeWordService extends BaseService {
  constructor(config = {}) {
    super('WakeWord', config);
    this.keywords = config.keywords || ['小智', '你好小智', 'Hey XiaoZhi'];
    this.sensitivity = config.sensitivity || 0.7; // 敏感度 0-1
    this.minConfidence = config.minConfidence || 0.6; // 最小置信度
    this.language = config.language || 'zh-CN';
    this.modelPath = config.modelPath || null; // 唤醒词模型路径
  }

  async _initialize() {
    console.log('初始化唤醒词检测服务');
    // 这里可以加载专门的唤醒词检测模型
    // 例如使用Porcupine、Snowboy或其他唤醒词引擎
    
    // 模拟初始化成功
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(`唤醒词检测服务已初始化，关键词: ${this.keywords.join(', ')}`);
  }

  /**
   * 检测音频数据中是否包含唤醒词
   * @param {Buffer} audioData - 音频数据
   * @param {Object} options - 检测选项
   * @returns {Object} 检测结果
   */
  async detect(audioData, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('唤醒词检测服务未启用或未初始化');
    }

    const opts = {
      sensitivity: options.sensitivity || this.sensitivity,
      minConfidence: options.minConfidence || this.minConfidence,
      ...options
    };

    try {
      // 在实际应用中，这里会调用专业的唤醒词检测库
      // 目前使用简单的文本匹配作为示例
      const result = await this._detectInAudio(audioData, opts);
      
      return {
        detected: result.detected,
        keyword: result.keyword,
        confidence: result.confidence,
        timestamp: Date.now(),
        provider: 'internal'
      };
    } catch (error) {
      console.error('唤醒词检测失败:', error);
      throw error;
    }
  }

  /**
   * 内部音频检测实现
   * @private
   */
  async _detectInAudio(audioData, options) {
    // 模拟音频处理 - 在实际应用中这里会调用专业的音频处理库
    console.log(`检测音频数据，大小: ${audioData.length} bytes`);
    
    // 将音频数据转换为文本进行简单匹配
    // 在实际应用中，这里应该先进行语音识别再进行唤醒词匹配
    const textContent = audioData.toString('utf8');
    
    // 检查是否包含任何唤醒词
    for (const keyword of this.keywords) {
      if (textContent.includes(keyword)) {
        const confidence = options.sensitivity * (0.8 + Math.random() * 0.2); // 基于敏感度调整置信度
        return {
          detected: true,
          keyword: keyword,
          confidence: confidence
        };
      }
    }
    
    // 没有检测到唤醒词
    return {
      detected: false,
      keyword: null,
      confidence: 0
    };
  }

  /**
   * 流式唤醒词检测
   * @param {ReadableStream} stream - 音频流
   * @param {Object} options - 检测选项
   */
  async streamDetect(stream, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('唤醒词检测服务未启用或未初始化');
    }

    console.log('开始流式唤醒词检测');
    
    // 收集音频数据进行检测
    const chunks = [];
    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    stream.on('end', async () => {
      const audioData = Buffer.concat(chunks);
      const result = await this.detect(audioData, options);
      console.log('流式检测结果:', result);
    });

    // 返回监听器对象以便外部处理结果
    return {
      onResult: (callback) => {
        stream.on('end', async () => {
          const audioData = Buffer.concat(chunks);
          const result = await this.detect(audioData, options);
          callback(result);
        });
      }
    };
  }

  /**
   * 设置唤醒词列表
   * @param {Array} keywords - 唤醒词数组
   */
  setKeywords(keywords) {
    this.keywords = keywords;
    console.log(`更新唤醒词列表: ${keywords.join(', ')}`);
  }

  /**
   * 添加唤醒词
   * @param {String} keyword - 要添加的唤醒词
   */
  addKeyword(keyword) {
    if (!this.keywords.includes(keyword)) {
      this.keywords.push(keyword);
      console.log(`添加唤醒词: ${keyword}`);
    }
  }

  /**
   * 移除唤醒词
   * @param {String} keyword - 要移除的唤醒词
   */
  removeKeyword(keyword) {
    const index = this.keywords.indexOf(keyword);
    if (index > -1) {
      this.keywords.splice(index, 1);
      console.log(`移除唤醒词: ${keyword}`);
    }
  }

  /**
   * 获取当前唤醒词列表
   * @returns {Array} 唤醒词数组
   */
  getKeywords() {
    return [...this.keywords];
  }

  /**
   * 设置敏感度
   * @param {Number} sensitivity - 敏感度值 0-1
   */
  setSensitivity(sensitivity) {
    this.sensitivity = Math.max(0, Math.min(1, sensitivity));
    console.log(`设置唤醒词敏感度: ${this.sensitivity}`);
  }

  /**
   * 获取支持的语言
   * @returns {Array} 支持的语言列表
   */
  getSupportedLanguages() {
    return [
      { code: 'zh-CN', name: '中文(简体)', dialect: '普通话' },
      { code: 'zh-TW', name: '中文(繁体)', dialect: '台湾国语' },
      { code: 'en-US', name: 'English(US)', dialect: 'American English' },
      { code: 'ja-JP', name: '日本語', dialect: '標準語' }
    ];
  }

  async _healthCheck() {
    try {
      const mockAudio = Buffer.from('mock_wake_word_audio');
      await this.detect(mockAudio);
      return {
        status: 'healthy',
        message: '唤醒词检测服务运行正常',
        keywords: this.keywords,
        sensitivity: this.sensitivity
      };
    } catch (error) {
      throw new Error(`唤醒词检测服务健康检查失败: ${error.message}`);
    }
  }

  /**
   * 设置唤醒词回调函数
   * @param {Function} callback - 回调函数
   */
  setWakeWordCallback(callback) {
    this.wakeWordCallback = callback;
  }
}

module.exports = WakeWordService;