import { promisify } from 'util';
import WebSocket from 'ws';
import zlib from 'zlib';
import { logger } from '../../utils/logger.js';
import BaseService from './base.js';
const gzip = promisify(zlib.gzip);

// Opus解码器 - 延迟加载
let OpusDecoder = null;

/**
 * 获取Opus解码器
 */
async function getOpusDecoder() {
  if (!OpusDecoder) {
    try {
      const opusPkg = await import('opusscript');
      OpusDecoder = opusPkg.default || opusPkg;
    } catch (error) {
      console.error('无法加载opusscript模块:', error.message);
      throw new Error('Opus解码器未安装，请运行: npm install opusscript');
    }
  }
  return OpusDecoder;
}

/**
 * 接口类型枚举
 */
const InterfaceType = {
  STREAM: 'stream',   // 流式识别
  FILE: 'file'        // 文件识别
};

/**
 * STT服务类 - 语音转文字
 * 参照Python实现，支持流式识别、Opus解码、VAD集成
 */
class SttService extends BaseService {
  constructor(config = {}) {
    super('STT', config);

    // 基本配置
    this.provider = config.provider || 'doubao';  // 默认使用火山引擎豆包
    this.language = config.language || 'zh-CN';
    this.sampleRate = config.sampleRate || 16000;
    this.channels = config.channels || 1;
    this.frameDuration = config.frameDuration || 60;
    this.frameSize = Math.floor(this.sampleRate * this.frameDuration / 1000);

    // 接口类型
    this.interfaceType = InterfaceType.STREAM;

    // 音频缓冲区
    this.audioBuffer = [];
    this.maxBufferSize = config.maxBufferSize || 100;

    // 唤醒词检测
    this.enableWakeWordDetection = config.enableWakeWordDetection || false;
    this.wakeWords = config.wakeWords || ['小智', '你好小智'];
    this.wakeWordCallback = null;

    // VAD配置
    this.vadEnabled = config.vadEnabled !== false;
    this.vadThreshold = config.vadThreshold || 0.5;

    // 会话管理
    this.sessions = new Map();

    // 识别结果回调
    this.onResult = null;
    this.onError = null;

    // Opus解码器实例
    this.decoder = null;

    // 提供商特定配置
    this.providerConfig = config[config.provider] || {};

    // 输出目录
    this.outputDir = config.outputDir || 'tmp/';

    // 是否删除临时音频文件
    this.deleteAudioFile = config.deleteAudioFile !== false;
  }

  async _initialize() {
    // 初始化Opus解码器
    try {
      const OpusDecoderClass = await getOpusDecoder();
      this.decoder = new OpusDecoderClass(this.sampleRate, this.channels);
      logger.info(`[${this.name}] Opus解码器初始化成功`);
    } catch (error) {
      console.warn(`[${this.name}] Opus解码器初始化失败:`, error.message);
    }

    // 根据提供商初始化不同的STT服务
    switch (this.provider) {
      case 'doubao':
        await this._initDoubaoAsr();
        break;
      case 'funasr':
        await this._initFunAsr();
        break;
      case 'xunfei':
        await this._initXunfeiStt();
        break;
      case 'aliyun':
        await this._initAliyunStt();
        break;
      default:
        throw new Error(`不支持的STT提供商: ${this.provider}`);
    }

    console.log(`[${this.name}] 服务初始化完成，提供商: ${this.provider}`);
  }

  async _initDoubaoAsr() {
    // 火山引擎豆包ASR配置
    const config = this.providerConfig;
    this.doubaoConfig = {
      appid: config.appid || process.env.DOUBAO_ASR_APPID,
      cluster: config.cluster || process.env.DOUBAO_ASR_CLUSTER,
      accessToken: config.access_token || config.accessToken || process.env.DOUBAO_ASR_ACCESS_TOKEN,
      wsUrl: config.wsUrl || 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
      uid: config.uid || 'streaming_asr_service',
      workflow: config.workflow || 'audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate',
      resultType: config.resultType || 'single',
      format: config.format || 'pcm',
      codec: config.codec || 'pcm',
      rate: config.rate || this.sampleRate,
      bits: config.bits || 16,
      channel: config.channel || this.channels,
      authMethod: config.authMethod || 'token',
      endWindowSize: config.endWindowSize || 200,
      enableMultilingual: config.enableMultilingual || false
    };

    // 验证必要配置
    if (!this.doubaoConfig.appid || !this.doubaoConfig.accessToken) {
      console.warn(`[${this.name}] 豆包ASR缺少必要配置，将使用模拟模式`);
      this.simulationMode = true;
    } else {
      this.simulationMode = false;
    }

    console.log(`[${this.name}] 豆包ASR初始化完成`);
  }

  async _initFunAsr() {
    // FunASR配置 - 支持本地部署或远程服务
    // 参照Python: fun_server.py
    const config = this.providerConfig;

    const host = config.host || process.env.FUNASR_HOST || 'localhost';
    const port = config.port || process.env.FUNASR_PORT || 10095;
    // 默认不使用SSL（本地部署通常不需要SSL）
    const isSsl = config.is_ssl === true || process.env.FUNASR_SSL === 'true';

    this.funasrConfig = {
      host,
      port: parseInt(port),
      isSsl,
      apiKey: config.api_key || process.env.FUNASR_API_KEY || 'none',
      // WebSocket URI - 根据SSL配置选择协议
      uri: isSsl ? `wss://${host}:${port}` : `ws://${host}:${port}`,
      // 模式配置
      mode: config.mode || 'offline',
      chunkSize: config.chunk_size || [5, 10, 5],
      chunkInterval: config.chunk_interval || 10,
      itn: config.itn !== false,  // 逆文本标准化
    };

    // 检查是否配置了服务器
    this.simulationMode = !config.host && !process.env.FUNASR_HOST &&
      !config.serverUrl && !process.env.FUNASR_SERVER_URL;

    // console.log(`[${this.name}] FunASR初始化完成`);
    // console.log(`[${this.name}] 服务地址: ${this.funasrConfig.uri}`);
    // console.log(`[${this.name}] 模拟模式: ${this.simulationMode ? '是' : '否'}`);
  }

  async _initXunfeiStt() {
    // 讯飞STT配置
    const config = this.providerConfig;
    this.xunfeiConfig = {
      appId: config.appId || process.env.XUNFEI_APP_ID,
      apiKey: config.apiKey || process.env.XUNFEI_API_KEY,
      apiSecret: config.apiSecret || process.env.XUNFEI_API_SECRET
    };
    console.log(`[${this.name}] 讯飞STT初始化完成`);
  }

  async _initAliyunStt() {
    // 阿里云STT配置
    const config = this.providerConfig;
    this.aliyunConfig = {
      accessKeyId: config.accessKeyId || process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: config.accessKeySecret || process.env.ALIYUN_ACCESS_KEY_SECRET,
      appKey: config.appKey || process.env.ALIYUN_ASR_APP_KEY
    };
    console.log(`[${this.name}] 阿里云STT初始化完成`);
  }

  /**
   * 创建会话
   * @param {string} sessionId - 会话ID
   * @param {Object} options - 会话选项
   * @returns {Object} 会话对象
   */
  createSession(sessionId, options = {}) {
    const session = {
      id: sessionId,
      audioBuffer: [],
      ws: null,
      isProcessing: false,
      text: '',
      lastActivityTime: Date.now(),
      listenMode: options.listenMode || 'auto',
      voiceStop: false,
      hasVoice: false,
      decoder: null,
      ...options
    };

    this.sessions.set(sessionId, session);
    console.log(`[${this.name}] 创建会话: ${sessionId}`);
    return session;
  }

  /**
   * 获取会话
   * @param {string} sessionId - 会话ID
   * @returns {Object|null} 会话对象
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * 关闭会话
   * @param {string} sessionId - 会话ID
   */
  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      // 关闭WebSocket连接
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.close();
      }
      // 释放解码器
      if (session.decoder) {
        session.decoder = null;
      }
      this.sessions.delete(sessionId);
      console.log(`[${this.name}] 关闭会话: ${sessionId}`);
    }
  }

  /**
   * 接收音频数据
   * @param {string} sessionId - 会话ID
   * @param {Buffer} audioData - 音频数据（Opus或PCM）
   * @param {Object} options - 选项
   */
  async receiveAudio(sessionId, audioData, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    const { hasVoice = true, format = 'opus' } = options;

    // 更新活动时间
    session.lastActivityTime = Date.now();
    session.hasVoice = hasVoice;

    // 缓存音频
    session.audioBuffer.push(audioData);

    // 限制缓冲区大小
    if (session.audioBuffer.length > this.maxBufferSize) {
      session.audioBuffer = session.audioBuffer.slice(-this.maxBufferSize);
    }

    // 如果是流式模式且有WebSocket连接，发送音频数据
    if (this.interfaceType === InterfaceType.STREAM && session.ws && session.isProcessing) {
      await this._sendAudioToStream(session, audioData, format);
    }

    // 自动模式：检测语音停止
    if (session.listenMode === 'auto' && session.voiceStop) {
      const audioTask = session.audioBuffer.slice();
      session.audioBuffer = [];
      session.voiceStop = false;

      if (audioTask.length > 15) {
        await this._handleVoiceStop(session, audioTask);
      }
    }
  }

  /**
   * 发送音频到流式识别服务
   * @param {Object} session - 会话对象
   * @param {Buffer} audioData - 音频数据
   * @param {string} format - 音频格式
   */
  async _sendAudioToStream(session, audioData, format) {
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      // 解码Opus为PCM
      let pcmData;
      if (format === 'opus') {
        pcmData = this._decodeOpus(audioData);
      } else {
        pcmData = audioData;
      }

      // 根据提供商发送数据
      if (this.provider === 'doubao') {
        await this._sendDoubaoAudio(session.ws, pcmData);
      }
    } catch (error) {
      console.error(`[${this.name}] 发送音频失败:`, error.message);
    }
  }

  /**
   * 解码Opus音频为PCM
   * @param {Buffer} opusData - Opus数据
   * @returns {Buffer} PCM数据
   */
  _decodeOpus(opusData) {
    if (!this.decoder) {
      console.warn(`[${this.name}] Opus解码器未初始化`);
      return Buffer.alloc(0);
    }

    try {
      // opusscript 解码需要指定帧大小（样本数）
      // 对于 60ms 帧 @ 16kHz: frameSize = 16000 * 0.06 = 960 样本
      // 对于 20ms 帧 @ 48kHz: frameSize = 48000 * 0.02 = 960 样本
      const pcmData = this.decoder.decode(opusData, this.frameSize);

      // 检查解码结果是否有效（非全零）
      if (pcmData && pcmData.length > 0) {
        const int16Array = new Int16Array(pcmData.buffer || pcmData);
        let maxAmplitude = 0;
        for (let i = 0; i < Math.min(100, int16Array.length); i++) {
          maxAmplitude = Math.max(maxAmplitude, Math.abs(int16Array[i]));
        }
        // console.log(`[${this.name}] Opus解码: ${opusData.length} bytes -> ${pcmData.length} bytes, 最大振幅: ${maxAmplitude}`);
        return Buffer.from(pcmData);
      }
      return Buffer.alloc(0);
    } catch (error) {
      console.error(`[${this.name}] Opus解码失败:`, error.message, `frameSize=${this.frameSize}`);
      return Buffer.alloc(0);
    }
  }

  /**
   * 解码Opus帧数组为PCM
   * @param {Buffer[]} opusFrames - Opus帧数组
   * @returns {Buffer[]} PCM帧数组
   */
  _decodeOpusFrames(opusFrames) {
    const pcmFrames = [];

    for (const frame of opusFrames) {
      if (!frame || frame.length === 0) continue;

      const pcmData = this._decodeOpus(frame);
      if (pcmData && pcmData.length > 0) {
        pcmFrames.push(pcmData);
      }
    }

    return pcmFrames;
  }

  /**
   * 处理语音停止
   * @param {Object} session - 会话对象
   * @param {Buffer[]} audioData - 音频数据数组
   */
  async _handleVoiceStop(session, audioData) {
    const startTime = Date.now();

    console.log(`[${this.name}] 开始处理语音停止，音频帧数: ${audioData.length}`);

    try {
      // 解码Opus音频
      const pcmFrames = this._decodeOpusFrames(audioData);
      console.log(`[${this.name}] Opus解码完成，PCM帧数: ${pcmFrames.length}`);

      const combinedPcm = Buffer.concat(pcmFrames);
      console.log(`[${this.name}] PCM数据大小: ${combinedPcm.length} bytes`);

      if (combinedPcm.length === 0) {
        console.warn(`[${this.name}] 没有有效的PCM数据`);
        return;
      }

      // 进行语音识别
      console.log(`[${this.name}] 开始调用FunASR识别...`);
      const result = await this._recognizePcm(combinedPcm, session.id);

      const processTime = Date.now() - startTime;
      console.log(`[${this.name}] 识别完成，耗时: ${processTime}ms, 结果: ${JSON.stringify(result)}`);

      // 触发结果回调
      if (this.onResult && result.text) {
        console.log(`[${this.name}] 触发结果回调: ${session.id}`);
        this.onResult(session.id, result);
      } else {
        console.warn(`[${this.name}] 未触发回调: onResult=${!!this.onResult}, text=${result.text}`);
      }

      return result;
    } catch (error) {
      console.error(`[${this.name}] 处理语音停止失败:`, error.message);
      console.error(error.stack);
      if (this.onError) {
        this.onError(session.id, error);
      }
    }
  }

  /**
   * 识别PCM音频
   * @param {Buffer} pcmData - PCM音频数据
   * @param {string} sessionId - 会话ID
   * @returns {Object} 识别结果
   */
  async _recognizePcm(pcmData, sessionId) {
    switch (this.provider) {
      case 'doubao':
        return await this._recognizeWithDoubao(pcmData, sessionId);
      case 'funasr':
        return await this._recognizeWithFunAsr(pcmData, sessionId);
      case 'xunfei':
        return await this._recognizeWithXunfei(pcmData, sessionId);
      case 'aliyun':
        return await this._recognizeWithAliyun(pcmData, sessionId);
      default:
        throw new Error(`不支持的STT提供商: ${this.provider}`);
    }
  }

  /**
   * 豆包ASR识别
   */
  async _recognizeWithDoubao(pcmData, sessionId) {
    if (this.simulationMode) {
      return {
        text: '这是模拟识别结果',
        confidence: 0.9,
        duration: Math.floor(pcmData.length / 32),  // 大约估算
        provider: 'doubao',
        sessionId
      };
    }

    const session = this.sessions.get(sessionId);

    // 建立流式识别连接
    if (!session || !session.ws) {
      await this._initDoubaoStream(session);
    }

    // 返回当前识别结果
    return {
      text: session?.text || '',
      confidence: 0.9,
      duration: Math.floor(pcmData.length / 32),
      provider: 'doubao',
      sessionId
    };
  }

  /**
   * 初始化豆包流式识别
   */
  async _initDoubaoStream(session) {
    if (!session) return;

    try {
      const headers = this._getDoubaoAuthHeaders();

      session.ws = new WebSocket(this.doubaoConfig.wsUrl, {
        headers
      });

      session.ws.on('open', () => {
        console.log(`[${this.name}] 豆包ASR WebSocket连接成功`);
        // 发送初始化请求
        const initRequest = this._buildDoubaoInitRequest(session.id);
        session.ws.send(initRequest);
      });

      session.ws.on('message', (data) => {
        this._handleDoubaoMessage(session, data);
      });

      session.ws.on('error', (error) => {
        console.error(`[${this.name}] 豆包ASR WebSocket错误:`, error.message);
        session.isProcessing = false;
      });

      session.ws.on('close', () => {
        console.log(`[${this.name}] 豆包ASR WebSocket关闭`);
        session.isProcessing = false;
        session.ws = null;
      });

    } catch (error) {
      console.error(`[${this.name}] 初始化豆包流式识别失败:`, error.message);
    }
  }

  /**
   * 获取豆包认证头
   */
  _getDoubaoAuthHeaders() {
    return {
      'X-Api-App-Key': this.doubaoConfig.appid,
      'X-Api-Access-Key': this.doubaoConfig.accessToken,
      'X-Api-Resource-Id': 'volc.bigasr.sauc.duration',
      'X-Api-Connect-Id': this._generateUUID()
    };
  }

  /**
   * 构建豆包初始化请求
   */
  async _buildDoubaoInitRequest(sessionId) {
    const request = {
      app: {
        appid: this.doubaoConfig.appid,
        cluster: this.doubaoConfig.cluster,
        token: this.doubaoConfig.accessToken
      },
      user: { uid: this.doubaoConfig.uid },
      request: {
        reqid: sessionId,
        workflow: this.doubaoConfig.workflow,
        show_utterances: true,
        result_type: this.doubaoConfig.resultType,
        sequence: 1,
        end_window_size: this.doubaoConfig.endWindowSize
      },
      audio: {
        format: this.doubaoConfig.format,
        codec: this.doubaoConfig.codec,
        rate: this.doubaoConfig.rate,
        bits: this.doubaoConfig.bits,
        channel: this.doubaoConfig.channel,
        sample_rate: this.doubaoConfig.rate
      }
    };

    const payload = Buffer.from(JSON.stringify(request));
    const compressed = await gzip(payload);

    const header = this._generateDoubaoHeader();
    const message = Buffer.concat([
      header,
      this._intToBytes(compressed.length, 4),
      compressed
    ]);

    return message;
  }

  /**
   * 生成豆包协议头
   */
  _generateDoubaoHeader() {
    // 协议版本1，消息类型1（客户端请求），序列化方法1（JSON），压缩方法1（GZIP）
    return Buffer.from([
      0x11,  // version=1, header_size=1
      0x10,  // message_type=1, message_type_specific_flags=0
      0x11,  // serial_method=1, compression_type=1
      0x00   // reserved
    ]);
  }

  /**
   * 发送音频数据到豆包
   */
  async _sendDoubaoAudio(ws, pcmData) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      const compressed = await gzip(pcmData);

      // 音频帧头
      const header = Buffer.from([
        0x11,  // version=1, header_size=1
        0x20,  // message_type=2（音频数据）, flags=0
        0x11,  // serial_method=1, compression_type=1
        0x00   // reserved
      ]);

      const message = Buffer.concat([
        header,
        this._intToBytes(compressed.length, 4),
        compressed
      ]);

      ws.send(message);
    } catch (error) {
      console.error(`[${this.name}] 发送豆包音频失败:`, error.message);
    }
  }

  /**
   * 处理豆包ASR消息
   */
  _handleDoubaoMessage(session, data) {
    try {
      const result = this._parseDoubaoResponse(data);

      if (result.payload_msg) {
        const payload = result.payload_msg;

        if (payload.result && payload.result.utterances) {
          for (const utterance of payload.result.utterances) {
            if (utterance.definite) {
              const text = utterance.text;
              console.log(`[${this.name}] 豆包识别结果: ${text}`);

              if (session.listenMode === 'manual') {
                session.text += text;
              } else {
                session.text = text;
              }

              // 自动模式：直接返回结果
              if (session.listenMode !== 'manual') {
                if (this.onResult) {
                  this.onResult(session.id, {
                    text: session.text,
                    confidence: 0.9,
                    provider: 'doubao'
                  });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`[${this.name}] 解析豆包响应失败:`, error.message);
    }
  }

  /**
   * 解析豆包响应
   */
  _parseDoubaoResponse(data) {
    if (data.length < 4) {
      return { error: '响应数据长度不足' };
    }

    const header = data.slice(0, 4);
    const messageType = header[1] >> 4;

    // 错误响应
    if (messageType === 0x0F) {
      const code = data.slice(4, 8).readInt32BE(0);
      return { code, error: true };
    }

    // JSON响应（跳过12字节头部）
    try {
      const jsonData = data.slice(12).toString('utf-8');
      return { payload_msg: JSON.parse(jsonData) };
    } catch (error) {
      return { error: 'JSON解析失败' };
    }
  }

  /**
   * FunASR识别 - WebSocket客户端实现
   * 参照Python: fun_server.py
   */
  async _recognizeWithFunAsr(pcmData, sessionId) {
    if (this.simulationMode) {
      return {
        text: '这是模拟识别结果',
        confidence: 0.9,
        duration: Math.floor(pcmData.length / 32),
        provider: 'funasr',
        sessionId
      };
    }

    return new Promise((resolve, reject) => {
      // FunASR服务器不需要子协议
      const ws = new WebSocket(this.funasrConfig.uri);

      let recognizedText = '';
      let timeoutId = null;

      ws.on('open', () => {
        console.log(`[${this.name}] FunASR WebSocket连接成功`);

        // 发送配置消息 - 参照Python实现
        const configMessage = JSON.stringify({
          mode: this.funasrConfig.mode,
          chunk_size: this.funasrConfig.chunkSize,
          chunk_interval: this.funasrConfig.chunkInterval,
          wav_name: sessionId,
          is_speaking: true,
          itn: this.funasrConfig.itn
        });

        ws.send(configMessage);
        console.log(`[${this.name}] 发送配置消息: ${configMessage}`);

        // 发送PCM数据
        ws.send(pcmData);

        // 发送结束消息
        const endMessage = JSON.stringify({ is_speaking: false });
        ws.send(endMessage);
        console.log(`[${this.name}] 发送结束消息: ${endMessage}`);

        // 设置超时
        timeoutId = setTimeout(() => {
          console.warn(`[${this.name}] FunASR识别超时`);
          ws.close();
          resolve({
            text: recognizedText,
            confidence: 0.9,
            duration: Math.floor(pcmData.length / 32),
            provider: 'funasr',
            sessionId,
            timeout: true
          });
        }, 10000);
      });

      ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());


          // 累积识别结果
          if (response.text) {
            recognizedText += response.text;
          }

          // 检查是否为最终结果
          if (response.is_final) {
            clearTimeout(timeoutId);
            ws.close();

            // 处理语言标签（参照Python: lang_tag_filter）
            const filteredResult = this._langTagFilter(recognizedText);

            // 如果返回的是对象格式（带语言和情绪信息）
            const resultText = typeof filteredResult === 'object'
              ? JSON.stringify(filteredResult, null, 2)
              : filteredResult;

            resolve({
              text: resultText,
              rawText: recognizedText,
              parsed: typeof filteredResult === 'object' ? filteredResult : null,
              confidence: 0.9,
              duration: Math.floor(pcmData.length / 32),
              provider: 'funasr',
              sessionId
            });
          }
        } catch (error) {
          console.error(`[${this.name}] 解析FunASR响应失败:`, error.message);
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeoutId);
        console.error(`[${this.name}] FunASR WebSocket错误:`, error.message);
        reject(new Error(`FunASR连接失败: ${error.message}`));
      });

      ws.on('close', () => {
        clearTimeout(timeoutId);
        console.log(`[${this.name}] FunASR WebSocket关闭`);

        // 如果还没有返回结果，返回已识别的文本
        if (recognizedText) {
          const filteredResult = this._langTagFilter(recognizedText);
          resolve({
            text: typeof filteredResult === 'object'
              ? JSON.stringify(filteredResult, null, 2)
              : filteredResult,
            rawText: recognizedText,
            confidence: 0.9,
            duration: Math.floor(pcmData.length / 32),
            provider: 'funasr',
            sessionId
          });
        }
      });
    });
  }

  /**
   * 语言标签过滤 - 参照Python: lang_tag_filter
   * FunASR返回格式: <|语种|><|情绪|><|事件|><|其他选项|>原文
   * 例如: <|zh|><|SAD|><|Speech|><|withitn|>你好啊，测试测试。
   */
  _langTagFilter(text) {
    if (!text) return text;

    // 情绪Emoji映射
    const EMOTION_EMOJI_MAP = {
      'HAPPY': '🙂',
      'SAD': '😔',
      'ANGRY': '😡',
      'NEUTRAL': '😶',
      'FEARFUL': '😰',
      'DISGUSTED': '🤢',
      'SURPRISED': '😲',
      'EMO_UNKNOWN': '😶'
    };

    // 提取所有标签（按顺序）
    const tagPattern = /<\|([^|]+)\|>/g;
    const allTags = [];
    let match;
    while ((match = tagPattern.exec(text)) !== null) {
      allTags.push(match[1]);
    }

    // 移除所有 <|...|> 格式的标签，获取纯文本
    const cleanText = text.replace(tagPattern, '').trim();

    // 如果没有标签，直接返回纯文本
    if (allTags.length === 0) {
      return cleanText;
    }

    // 按照 FunASR 的固定顺序提取标签
    const language = allTags[0] || 'zh';
    const emotion = allTags[1] || 'NEUTRAL';

    // 构建结果对象
    const result = {
      content: cleanText,
      language: language,
      emotion: EMOTION_EMOJI_MAP[emotion] || emotion
    };

    // 返回JSON字符串格式（兼容Python实现）
    return result;
  }

  /**
   * 讯飞STT识别
   */
  async _recognizeWithXunfei(pcmData, sessionId) {
    // 简化实现 - 实际应调用讯飞API
    return {
      text: '',
      confidence: 0.9,
      duration: Math.floor(pcmData.length / 32),
      provider: 'xunfei',
      sessionId
    };
  }

  /**
   * 阿里云STT识别
   */
  async _recognizeWithAliyun(pcmData, sessionId) {
    // 简化实现 - 实际应调用阿里云API
    return {
      text: '',
      confidence: 0.9,
      duration: Math.floor(pcmData.length / 32),
      provider: 'aliyun',
      sessionId
    };
  }

  /**
   * 同步识别方法（兼容原有接口）
   * @param {Buffer} audioData - 音频数据
   * @param {Object} options - 选项
   * @returns {Object} 识别结果
   */
  async recognize(audioData, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('STT服务未启用或未初始化');
    }

    const opts = {
      language: options.language || this.language,
      sampleRate: options.sampleRate || this.sampleRate,
      enableWakeWordDetection: options.enableWakeWordDetection || this.enableWakeWordDetection,
      ...options
    };

    // 如果启用了唤醒词检测，先进行唤醒词检测
    if (opts.enableWakeWordDetection) {
      const wakeWordResult = await this._detectWakeWord(audioData, opts);
      if (wakeWordResult.detected) {
        console.log(`[${this.name}] 检测到唤醒词: ${wakeWordResult.keyword}, 置信度: ${wakeWordResult.confidence}`);

        // 触发唤醒词回调
        if (this.wakeWordCallback) {
          this.wakeWordCallback(wakeWordResult);
        }

        return {
          text: `[WAKE_WORD_DETECTED] ${wakeWordResult.keyword}`,
          confidence: wakeWordResult.confidence,
          isWakeWord: true,
          keyword: wakeWordResult.keyword,
          timestamp: wakeWordResult.timestamp,
          provider: 'wake_word_detection'
        };
      }
    }

    try {
      // 解码Opus为PCM
      let pcmData = audioData;
      if (opts.format === 'opus' || this._isOpusData(audioData)) {
        pcmData = this._decodeOpus(audioData);
      }

      const result = await this._recognizePcm(pcmData, opts.sessionId || 'default');

      return {
        text: result.text,
        confidence: result.confidence || 0.9,
        duration: result.duration || 0,
        provider: this.provider,
        language: opts.language
      };
    } catch (error) {
      console.error(`[${this.name}] 识别失败:`, error);
      throw error;
    }
  }

  /**
   * 判断是否为Opus数据
   */
  _isOpusData(data) {
    // Opus数据通常以特定字节开头
    return data && data.length > 0 && data[0] !== 0x52; // 不以'R'开头（RIFF/WAV）
  }

  /**
   * 唤醒词检测
   */
  async _detectWakeWord(audioData, options) {
    const wakeWords = options.wakeWords || this.wakeWords;

    // 简化实现 - 实际应使用唤醒词检测库
    // 这里基于识别结果进行文本匹配
    try {
      const result = await this.recognize(audioData, { ...options, enableWakeWordDetection: false });

      for (const wakeWord of wakeWords) {
        if (result.text && result.text.includes(wakeWord)) {
          return {
            detected: true,
            keyword: wakeWord,
            confidence: result.confidence,
            timestamp: Date.now()
          };
        }
      }
    } catch (error) {
      // 忽略错误
    }

    return {
      detected: false,
      keyword: null,
      confidence: 0,
      timestamp: Date.now()
    };
  }

  /**
   * 设置语音停止标志
   */
  setVoiceStop(sessionId, stopped = true) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.voiceStop = stopped;
    }
  }

  /**
   * 设置监听模式
   */
  setListenMode(sessionId, mode) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.listenMode = mode;
    }
  }

  /**
   * 清空音频缓冲区
   */
  clearAudioBuffer(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.audioBuffer = [];
    }
  }

  /**
   * 流式识别（兼容接口）
   */
  async streamRecognize(stream, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('STT服务未启用或未初始化');
    }

    console.log(`[${this.name}] 开始流式语音识别`);
    return {
      text: '',
      isFinal: false,
      confidence: 0.8
    };
  }

  /**
   * 设置唤醒词回调
   */
  setWakeWordCallback(callback) {
    this.wakeWordCallback = callback;
  }

  /**
   * 设置结果回调
   */
  setResultCallback(callback) {
    this.onResult = callback;
  }

  /**
   * 设置错误回调
   */
  setErrorCallback(callback) {
    this.onError = callback;
  }

  /**
   * 启用/禁用唤醒词检测
   */
  setWakeWordDetection(enabled) {
    this.enableWakeWordDetection = enabled;
    console.log(`[${this.name}] 唤醒词检测已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 设置唤醒词列表
   */
  setWakeWords(wakeWords) {
    this.wakeWords = wakeWords;
    console.log(`[${this.name}] 更新唤醒词列表: ${wakeWords.join(', ')}`);
  }

  /**
   * 健康检查
   */
  async _healthCheck() {
    return {
      message: 'STT服务运行正常',
      provider: this.provider,
      language: this.language,
      sessions: this.sessions.size
    };
  }

  /**
   * 清理会话历史
   */
  clearHistory(sessionId) {
    if (sessionId) {
      this.closeSession(sessionId);
    }
  }

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages() {
    return [
      { code: 'zh-CN', name: '中文(简体)', dialect: '普通话' },
      { code: 'zh-TW', name: '中文(繁体)', dialect: '台湾国语' },
      { code: 'en-US', name: 'English(US)', dialect: 'American English' },
      { code: 'ja-JP', name: '日本語', dialect: '標準語' }
    ];
  }

  /**
   * 更新语言设置
   */
  updateLanguage(language) {
    this.language = language;
  }

  /**
   * 更新提供商
   */
  async updateProvider(provider) {
    this.provider = provider;
    this.initialized = false;
    return this.initialize();
  }

  /**
   * 销毁服务
   */
  async _destroy() {
    // 关闭所有会话
    for (const [sessionId] of this.sessions) {
      await this.closeSession(sessionId);
    }

    // 释放解码器
    if (this.decoder) {
      this.decoder = null;
    }

    console.log(`[${this.name}] 服务已销毁`);
  }

  // ==================== 工具方法 ====================

  /**
   * 生成UUID
   */
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 整数转字节数组
   */
  _intToBytes(value, length) {
    const buffer = Buffer.alloc(length);
    if (length === 4) {
      buffer.writeInt32BE(value, 0);
    } else if (length === 2) {
      buffer.writeInt16BE(value, 0);
    }
    return buffer;
  }
}

export default SttService;