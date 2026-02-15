const { logger } = require('../utils/logger');
const BaseService = require('./services/base');
const EdgeTTS = require('edge-tts-universal');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * TTS服务 - 使用Edge TTS生成语音
 * 支持多种语音提供商：edge, openai, aliyun等
 */
class TtsService extends BaseService {
  constructor(config = {}) {
    super('TTS', config);
    this.ttsConfig = config.services?.tts || {};
    this.provider = this.ttsConfig.provider || 'edge';
    this.voice = this.ttsConfig.voice || 'zh-CN-XiaoxiaoNeural';
    this.outputDir = this.ttsConfig.output_dir || path.join(os.tmpdir(), 'tts');
    this.audioFormat = this.ttsConfig.format || 'opus';
    this.sampleRate = this.ttsConfig.sample_rate || 24000;
    
    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    // 标点符号配置
    this.punctuations = ['。', '？', '?', '！', '!', '；', ';', '：', '\n'];
    this.firstSentencePunctuations = ['，', '~', '、', ',', '。', '？', '?', '！', '!', '；', ';', '：'];
  }

  async _initialize() {
    // 初始化TTS服务
    logger.info(`初始化TTS服务，提供商: ${this.provider}, 语音: ${this.voice}`);
    
    // 测试TTS连接
    await this._testConnection();
  }

  /**
   * 测试TTS连接
   */
  async _testConnection() {
    try {
      // 生成一个简单的测试文本
      const testText = '测试';
      // 直接调用底层方法，绕过 isEnabled 检查
      const audioData = await this._synthesizeWithEdge(testText, { voice: this.voice });
      if (audioData && audioData.length > 0) {
        logger.info('TTS服务连接测试成功');
      } else {
        throw new Error('TTS返回空数据');
      }
    } catch (error) {
      logger.error(`TTS服务连接测试失败: ${error.message}`);
      // 不抛出错误，让服务继续运行
      logger.warn('TTS服务暂时不可用，但服务器将继续运行');
    }
  }

  /**
   * 根据提供商合成语音
   * @param {string} text - 要转换的文本
   * @returns {Promise<Buffer>} - 音频数据
   */
  async synthesize(text, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('TTS服务未启用或未初始化');
    }

    // 清理文本中的Markdown格式
    text = this._cleanMarkdown(text);

    const opts = {
      voice: options.voice || this.voice,
      ...options
    };

    try {
      let audioData;
      switch (this.provider) {
        case 'edge':
          audioData = await this._synthesizeWithEdge(text, opts);
          break;
        case 'system':
          audioData = await this._synthesizeWithSystem(text, opts);
          break;
        case 'openai':
          audioData = await this._synthesizeWithOpenAI(text, opts);
          break;
        case 'aliyun':
          audioData = await this._synthesizeWithAliyun(text, opts);
          break;
        default:
          audioData = await this._synthesizeWithEdge(text, opts);
      }

      logger.info(`TTS生成完成: ${text.substring(0, 20)}..., ${audioData.length} bytes`);
      return audioData;
    } catch (error) {
      logger.error(`TTS生成失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 使用Edge TTS合成语音
   */
  async _synthesizeWithEdge(text, options) {
    try {
      const { Communicate } = require('edge-tts-universal');
      
      // 创建通信实例
      const tts = new Communicate(text, { voice: options.voice });
      
      // 收集音频数据
      const audioChunks = [];
      for await (const chunk of tts.stream()) {
        if (chunk.type === 'audio') {
          audioChunks.push(chunk.data);
        }
      }
      
      // 合并音频数据
      if (audioChunks.length > 0) {
        return Buffer.concat(audioChunks);
      } else {
        throw new Error('未收到音频数据');
      }
    } catch (error) {
      logger.warn(`Edge TTS失败: ${error.message}，尝试系统TTS`);
      // 回退到系统TTS
      return await this._synthesizeWithSystem(text, options);
    }
  }

  /**
   * 使用OpenAI TTS合成语音（预留接口）
   */
  async _synthesizeWithOpenAI(text, options) {
    // TODO: 实现OpenAI TTS
    logger.warn('OpenAI TTS暂未实现，使用Edge TTS');
    return this._synthesizeWithEdge(text, options);
  }

  /**
   * 使用系统TTS合成语音（macOS/Linux）
   */
  async _synthesizeWithSystem(text, options) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      // 生成临时文件名
      const tempFile = this.generateFilename('.aiff');
      
      // 使用系统say命令生成音频
      const command = `say -v Ting-Ting "${text}" -o "${tempFile}"`;
      await execAsync(command);
      
      // 读取生成的音频文件
      const fs = require('fs');
      const audioData = fs.readFileSync(tempFile);
      
      // 删除临时文件
      fs.unlinkSync(tempFile);
      
      logger.info(`系统TTS生成成功: ${audioData.length} bytes`);
      return audioData;
    } catch (error) {
      logger.error(`系统TTS失败: ${error.message}`);
      throw new Error(`系统TTS生成失败: ${error.message}`);
    }
  }

  /**
   * 使用阿里云TTS合成语音（预留接口）
   */
  async _synthesizeWithAliyun(text, options) {
    // TODO: 实现阿里云TTS
    logger.warn('阿里云TTS暂未实现，使用Edge TTS');
    return this._synthesizeWithEdge(text, options);
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
        logger.error(`分段TTS生成失败: ${error.message}`);
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

  /**
   * 生成音频文件名
   * @param {string} extension - 文件扩展名
   * @returns {string} - 文件路径
   */
  generateFilename(extension = '.mp3') {
    const timestamp = new Date().toISOString().split('T')[0];
    const uuid = require('uuid').v4();
    return path.join(this.outputDir, `tts-${timestamp}@${uuid}${extension}`);
  }

  /**
   * 将音频转换为Opus格式
   * @param {Buffer} audioData - 原始音频数据
   * @returns {Promise<Buffer>} - Opus编码的音频数据
   */
  async convertToOpus(audioData) {
    // TODO: 实现真正的Opus编码
    // 当前简化实现：直接返回原始数据
    // 实际实现需要使用opus编码库
    logger.debug(`转换音频为Opus格式: ${audioData.length} bytes`);
    return audioData;
  }

  /**
   * 获取可用的语音列表
   * @returns {Array} - 语音列表
   */
  async getAvailableVoices() {
    try {
      const { listVoices } = require('edge-tts-universal');
      const voices = await listVoices();
      
      return voices.map(v => ({
        name: v.Name,
        shortName: v.ShortName,
        gender: v.Gender,
        locale: v.Locale
      }));
    } catch (error) {
      logger.error(`获取语音列表失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 设置语音
   * @param {string} voice - 语音名称
   */
  setVoice(voice) {
    this.voice = voice;
    logger.info(`TTS语音已设置为: ${voice}`);
  }

  /**
   * 设置提供商
   * @param {string} provider - 提供商名称
   */
  setProvider(provider) {
    this.provider = provider;
    logger.info(`TTS提供商已设置为: ${provider}`);
  }

  async _healthCheck() {
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

  async _destroy() {
    // 清理临时文件
    try {
      const files = fs.readdirSync(this.outputDir);
      for (const file of files) {
        if (file.startsWith('tts_')) {
          fs.unlinkSync(path.join(this.outputDir, file));
        }
      }
      logger.info('TTS临时文件清理完成');
    } catch (error) {
      logger.error(`清理TTS临时文件失败: ${error.message}`);
    }
  }
}

module.exports = TtsService;
