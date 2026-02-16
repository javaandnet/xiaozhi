import BaseService from './base.js';

class TtsService extends BaseService {
  constructor(config = {}) {
    super('TTS', config);
    this.provider = config.provider || 'edge';
    this.voice = config.voice || 'zh-CN-XiaoxiaoNeural';
    this.rate = config.rate || 1.0;
    this.volume = config.volume || 1.0;

    // 标点符号配置（用于文本分段）
    this.punctuations = ['。', '？', '?', '！', '!', '；', ';', '：', '\n'];
    this.firstSentencePunctuations = ['，', '~', '、', ',', '。', '？', '?', '！', '!', '；', ';', '：'];
  }

  async _initialize() {
    // 根据提供商初始化不同的TTS服务
    switch (this.provider) {
      case 'edge':
        await this._initEdgeTts();
        break;
      case 'xunfei':
        await this._initXunfeiTts();
        break;
      case 'aliyun':
        await this._initAliyunTts();
        break;
      default:
        throw new Error(`不支持的TTS提供商: ${this.provider}`);
    }
  }

  async _initEdgeTts() {
    // 初始化Edge TTS服务
    try {
      const { EdgeTTS } = await import('node-edge-tts');
      this.edgeTTS = EdgeTTS;
      console.log('✅ Edge TTS服务初始化成功');
    } catch (error) {
      console.error('❌ Edge TTS服务初始化失败:', error.message);
      throw new Error(`Edge TTS初始化失败: ${error.message}`);
    }
  }

  async _initXunfeiTts() {
    // 初始化讯飞TTS服务
    console.log('初始化讯飞TTS服务');
  }

  async _initAliyunTts() {
    // 初始化阿里云TTS服务
    console.log('初始化阿里云TTS服务');
  }

  async synthesize(text, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('TTS服务未启用或未初始化');
    }

    // 清理文本中的Markdown格式
    text = this._cleanMarkdown(text);

    const opts = {
      voice: options.voice || this.voice,
      rate: options.rate || this.rate,
      volume: options.volume || this.volume,
      ...options
    };

    try {
      let audioData;
      switch (this.provider) {
        case 'edge':
          audioData = await this._synthesizeWithEdge(text, opts);
          break;
        case 'xunfei':
          audioData = await this._synthesizeWithXunfei(text, opts);
          break;
        case 'aliyun':
          audioData = await this._synthesizeWithAliyun(text, opts);
          break;
        default:
          throw new Error(`不支持的TTS提供商: ${this.provider}`);
      }

      // 直接返回音频数据Buffer，与WebSocket处理器期望的格式匹配
      return audioData;
    } catch (error) {
      console.error('TTS合成失败:', error);
      throw error;
    }
  }

  async _synthesizeWithEdge(text, options) {
    // Edge TTS实现 - 使用node-edge-tts库
    if (!this.edgeTTS) {
      throw new Error('Edge TTS未初始化');
    }

    try {
      console.log(`🔊 使用Edge TTS合成: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`);

      // 创建TTS实例
      const tts = new this.edgeTTS({
        voice: options.voice || this.voice,
        rate: options.rate ? `${options.rate}%` : '+0%',
        volume: options.volume ? `${options.volume}%` : '+0%'
      });

      // 生成临时文件路径
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      const tempFilePath = path.join(os.tmpdir(), `temp-${Date.now()}.mp3`);

      // 生成音频文件
      await tts.ttsPromise(text, tempFilePath);

      // 读取音频数据
      const audioData = fs.readFileSync(tempFilePath);

      // 清理临时文件
      fs.unlinkSync(tempFilePath);

      console.log(`✅ TTS合成完成: ${audioData.length} bytes`);
      return audioData;

    } catch (error) {
      console.error('❌ Edge TTS合成失败:', error.message);
      throw new Error(`TTS合成失败: ${error.message}`);
    }
  }

  async _synthesizeWithXunfei(text, options) {
    // 讯飞TTS实现
    console.log(`使用讯飞TTS合成: ${text}`);
    // 返回模拟的音频数据
    return Buffer.from('mock_audio_data_xunfei');
  }

  async _synthesizeWithAliyun(text, options) {
    // 阿里云TTS实现
    console.log(`使用阿里云TTS合成: ${text}`);
    // 返回模拟的音频数据
    return Buffer.from('mock_audio_data_aliyun');
  }

  _estimateDuration(text) {
    // 估算音频时长（毫秒）
    const charsPerSecond = 3; // 每秒3个汉字
    const seconds = text.length / charsPerSecond;
    return Math.round(seconds * 1000);
  }

  /**
   * 流式合成语音（支持回调方式）
   * @param {string} text - 要转换的文本
   * @param {Function} callback - 音频数据回调函数
   */
  async synthesizeStream(text, callback) {
    if (!this.isEnabled()) {
      throw new Error('TTS服务未启用或未初始化');
    }

    // 清理文本
    text = this._cleanMarkdown(text);

    // 分段处理
    const segments = this._splitText(text);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isFirst = i === 0;
      const isLast = i === segments.length - 1;

      try {
        const audioData = await this.synthesize(segment);
        callback({
          audio: audioData,
          text: segment,
          isFirst,
          isLast
        });
      } catch (error) {
        console.error(`分段TTS生成失败: ${error.message}`);
      }
    }
  }

  /**
   * 根据标点符号分割文本
   * @param {string} text - 原始文本
   * @returns {Array} - 文本片段数组
   */
  _splitText(text) {
    if (!text) return [];

    const segments = [];
    let currentSegment = '';

    for (const char of text) {
      currentSegment += char;

      if (this.punctuations.includes(char)) {
        if (currentSegment.trim()) {
          segments.push(currentSegment.trim());
        }
        currentSegment = '';
      }
    }

    // 处理最后一段
    if (currentSegment.trim()) {
      segments.push(currentSegment.trim());
    }

    return segments;
  }

  /**
   * 清理Markdown格式
   * @param {string} text - 原始文本
   * @returns {string} - 清理后的文本
   */
  _cleanMarkdown(text) {
    if (!text) return '';

    return text
      .replace(/#{1,6}\s/g, '')  // 移除标题标记
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // 移除粗体
      .replace(/\*([^*]+)\*/g, '$1')  // 移除斜体
      .replace(/`{1,3}[^`]*`{1,3}/g, '')  // 移除代码块
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // 移除链接，保留文字
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')  // 移除图片
      .replace(/\n{3,}/g, '\n\n')  // 减少多余换行
      .trim();
  }

  async _healthCheck() {
    // 测试TTS服务健康状态
    try {
      const testText = '健康检查测试';
      const result = await this.synthesize(testText);
      return {
        message: 'TTS服务运行正常',
        provider: this.provider,
        voice: this.voice,
        outputSize: result.length
      };
    } catch (error) {
      throw new Error(`TTS服务健康检查失败: ${error.message}`);
    }
  }

  getSupportedVoices() {
    // 返回支持的语音列表
    return [
      { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', gender: 'female', language: 'zh-CN' },
      { id: 'zh-CN-YunyangNeural', name: '云扬', gender: 'male', language: 'zh-CN' },
      { id: 'en-US-JennyNeural', name: 'Jenny', gender: 'female', language: 'en-US' }
    ];
  }

  updateVoice(voice) {
    this.voice = voice;
  }

  updateProvider(provider) {
    this.provider = provider;
    // 重新初始化服务
    this.initialized = false;
    return this.initialize();
  }
}

export default TtsService;