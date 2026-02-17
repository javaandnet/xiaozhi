import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import DeviceManager from '../managers/device.js';
import audioConverter from '../utils/audioConverter.js';

/**
 * WebSocket 处理器
 * 负责连接管理、消息处理、业务逻辑
 */
class WebSocketHandler {
  constructor(options = {}) {
    this.wss = options.wss;
    this.heartbeatInterval = null;
    this.config = options.config || {};
    this.deviceManager = options.deviceManager;
    this.sessionManager = options.sessionManager;
    this.audioManager = options.audioManager;
    this.ttsService = options.ttsService;
    this.sttService = options.sttService;
    this.llmService = options.llmService;

    // 注册到设备管理器
    if (this.deviceManager && !this.deviceManager.addDevice) {
      // 使用内部的deviceManager实例
      this.internalDeviceManager = new DeviceManager();
    }

    // 添加sendMessage兼容性方法
    this.sendMessage = this.sendToClient.bind(this);
  }

  // ==================== 连接管理 ====================

  /**
   * 处理新连接 - 设置客户端信息和事件监听
   */
  handleConnection(ws, req) {
    const clientId = uuidv4();
    const clientIp = req.socket.remoteAddress;

    logger.info(`新的WebSocket连接: ${clientId} 来自 ${clientIp}`);

    // 设置客户端信息
    ws.clientId = clientId;
    ws.clientIp = clientIp;
    ws.connectedAt = new Date();
    ws.isAlive = true;
    ws.isAuthenticated = false;
    ws.sessionId = null;

    // 发送连接确认
    this.sendToClient(ws, {
      type: 'connection_ack',
      clientId: clientId,
      timestamp: new Date().toISOString()
    });

    // 注册到设备管理器
    const dm = this.getDeviceManager();
    if (dm && dm.addDevice) {
      dm.addDevice({
        id: ws.clientId,
        ip: ws.clientIp,
        connection: ws,
        connectedAt: new Date()
      });
    }

    // 处理消息
    ws.on('message', (data) => {
      try {
        this.handleMessage(ws, data);
      } catch (error) {
        logger.error(`处理消息失败:`, error);
        this.sendError(ws, '消息处理失败');
      }
    });

    // 处理连接关闭
    ws.on('close', () => {
      logger.info(`WebSocket连接关闭: ${clientId}`);
      this.handleDisconnect(ws);
    });

    // 处理错误
    ws.on('error', (error) => {
      logger.error(`WebSocket错误 [${clientId}]:`, error);
    });

    // 心跳检测
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  }

  /**
   * 处理连接断开
   */
  handleDisconnect(ws) {
    const dm = this.getDeviceManager();
    if (dm && dm.removeDevice) {
      dm.removeDevice(ws.clientId);
    }
    if (ws.sessionId) {
      logger.info(`会话结束: ${ws.sessionId} (${ws.clientId})`);
    }
  }

  // ==================== 消息处理 ====================

  /**
   * 处理消息
   */
  handleMessage(ws, data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      // 如果不是JSON，可能是二进制音频数据
      this.handleBinaryData(ws, data);
      return;
    }

    const { type, sessionId, ...payload } = message;

    // 更新会话ID
    if (sessionId) {
      ws.sessionId = sessionId;
    }

    console.log(`处理消息类型: ${type}`);

    // 根据消息类型处理
    switch (type) {
      case 'hello':
      case 'listen':
      case 'abort':
      case 'iot':
      case 'chat':
        this.handleProtocolMessage(ws, type, payload);
        break;
      case 'start_recognition':
        console.log(`处理开始识别请求 [${ws.clientId}]`);
        this.sendMessage(ws, {
          type: 'recognition_started',
          sessionId: ws.sessionId,
          message: '语音识别已启动，可以说话了'
        });
        break;
      case 'audio_data':
        console.log(`处理音频数据 [${ws.clientId}]: ${payload.audioData?.length || 0} bytes`);
        this.handleAudioData(ws, payload);
        break;
      case 'wake_word_detected':
        console.log(`处理唤醒词检测通知 [${ws.clientId}]: ${payload.keyword}`);
        this.handleWakeWordDetected(ws, payload);
        break;
      default:
        console.warn(`未知消息类型: ${type}`);
    }
  }

  /**
   * 处理二进制数据
   */
  handleBinaryData(ws, data) {
    logger.debug(`收到二进制数据: ${data.length} bytes (${ws.clientId})`);
  }

  // ==================== 协议消息处理 ====================

  handleProtocolMessage(ws, type, payload) {
    // 处理原始ESP32协议消息
    switch (type) {
      case 'hello':
        // 支持两种hello消息格式
        const { version, transport, audio_params, device_id, device_name, device_mac, token, features } = payload;

        // 检查是否是Web客户端格式（没有version和transport字段）
        const isWebClient = !version && !transport && (device_id || device_name);

        // 如果不是Web客户端，检查协议版本
        if (!isWebClient && (version !== 1 || transport !== 'websocket')) {
          this.sendError(ws, '不支持的协议版本或传输方式', ws.sessionId);
          return;
        }

        // 保存设备信息
        if (device_id) ws.deviceId = device_id;
        if (device_name) ws.deviceName = device_name;
        if (device_mac) ws.deviceMac = device_mac;
        if (token) ws.token = token;
        if (features) ws.features = features;

        ws.audioParams = audio_params || {
          format: 'opus',
          sampleRate: 16000,
          channels: 1,
          frameDuration: 60
        };
        ws.isAuthenticated = true;
        ws.sessionId = this.sessionManager.createSession({
          clientId: ws.clientId,
          deviceId: ws.deviceId || null
        }).sessionId;

        this.sendMessage(ws, {
          type: 'hello',
          transport: 'websocket',
          session_id: ws.sessionId,
          audio_params: ws.audioParams
        });
        console.log(`设备握手成功: ${ws.clientId}, Session: ${ws.sessionId}`);
        break;

      case 'listen':
        const { state: listenState, mode, text: listenText } = payload;
        if (!listenState) {
          this.sendError(ws, '缺少监听状态', ws.sessionId);
          return;
        }
        console.log(`监听状态更新 [${ws.clientId}]: ${listenState}`);
        break;

      case 'abort':
        const { reason } = payload;
        console.log(`会话终止 [${ws.sessionId}]: ${reason || '未知原因'} (${ws.clientId})`);
        // 清除会话数据
        if (ws.sessionId) {
          this.sessionManager.closeSession(ws.sessionId);
          if (this.ttsService) {
            this.ttsService.clearHistory(ws.sessionId);
          }
          if (this.sttService) {
            this.sttService.clearHistory(ws.sessionId);
          }
        }
        break;

      case 'iot':
        const { descriptors, states } = payload;
        console.log(`收到IoT消息 [${ws.clientId}]: descriptors=${!!descriptors}, states=${!!states}`);
        break;

      case 'chat':
        const { text: chatText, state: chatState } = payload;
        if (chatState === 'complete' && chatText) {
          console.log(`收到聊天消息 [${ws.clientId}]: ${chatText}`);
          // 转发用户消息给客户端显示
          this.sendMessage(ws, {
            type: 'stt',
            session_id: ws.sessionId,
            text: chatText,
            timestamp: new Date().toISOString()
          });
          // 处理完整的聊天消息
          this.handleCompleteChatMessage(ws, chatText);
        }
        break;
    }
  }

  /**
   * 处理完整的聊天消息 - 核心语音对话流程
   * @param {WebSocket} ws - WebSocket连接
   * @param {string} text - 用户输入文本
   */
  async handleCompleteChatMessage(ws, text) {
    const sessionId = ws.sessionId;
    const connectionId = ws.clientId;

    try {
      console.log(`开始处理聊天消息 [${connectionId}]: ${text}`);

      // 1. 发送处理开始状态
      // this.sendMessage(ws, {
      //   type: 'processing',
      //   session_id: sessionId,
      //   state: 'start',
      //   timestamp: new Date().toISOString()
      // });

      // 2. 调用LLM生成回复
      console.log(`调用LLM服务生成回复...`);
      let llmResponse;

      if (this.llmService && this.llmService.isConfigured()) {
        // 追加人设
        const personaPrompt = this.getPersonaPrompt();
        const textWithPersona = `${personaPrompt}\n\n用户说: ${text}`;

        try {
          llmResponse = await this.llmService.chat(connectionId, textWithPersona);
          console.log(`LLM回复生成成功: ${llmResponse.substring(0, 50)}...`);
        } catch (llmError) {
          console.error(`LLM调用失败: ${llmError.message}`);
          // LLM失败时使用默认回复
          llmResponse = `我听到了你说的"${text}"。有什么我可以帮助你的吗？`;
        }
      } else {
        // 没有配置LLM时使用默认回复
        llmResponse = `我听到了你说的"${text}"。有什么我可以帮助你的吗？`;
        console.log(`使用默认回复: ${llmResponse}`);
      }

      // 3. 发送LLM回复消息
      this.sendMessage(ws, {
        type: 'llm',
        session_id: sessionId,
        text: llmResponse,
        emotion: this.detectEmotion(llmResponse),
        timestamp: new Date().toISOString()
      });
      //http://127.0.0.1:9999/xiaozhi/ota/
      // 4. 开始TTS合成
      console.log(`开始TTS语音合成...`);
      this.sendMessage(ws, {
        type: 'tts',
        session_id: sessionId,
        state: 'start',
        timestamp: new Date().toISOString()
      });

      // 5. 调用TTS服务生成音频
      if (this.ttsService && this.ttsService.isEnabled()) {
        try {
          const ttsResult = await this.ttsService.synthesize(llmResponse);
          console.log(`✅ TTS合成完成: ${ttsResult.audio?.length || ttsResult.length} bytes`);

          // 6. 发送TTS状态消息 - sentence_start
          this.sendMessage(ws, {
            type: 'tts',
            session_id: sessionId,
            state: 'sentence_start',
            text: llmResponse,
            timestamp: new Date().toISOString()
          });

          // 7. 将MP3音频转换为Opus帧并发送
          const audioBuffer = ttsResult.audio || ttsResult;
          const opusFrames = await audioConverter.mp3ToOpusFrames(audioBuffer);
          console.log(`🎵 Opus编码完成: ${opusFrames.length} 帧`);

          // 8. 发送Opus音频帧（二进制）
          await this.sendOpusAudioFrames(ws, opusFrames, sessionId);

          // 9. 发送TTS停止消息
          this.sendMessage(ws, {
            type: 'tts',
            session_id: sessionId,
            state: 'stop',
            timestamp: new Date().toISOString()
          });

        } catch (ttsError) {
          console.error(`❌ TTS合成失败: ${ttsError.message}`);
          // TTS失败时发送文本作为备选
          this.sendMessage(ws, {
            type: 'tts_fallback',
            session_id: sessionId,
            text: llmResponse,
            error: ttsError.message,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        // TTS服务未启用时发送文本
        console.log(`TTS服务未启用，发送文本回复`);
        this.sendMessage(ws, {
          type: 'tts_disabled',
          session_id: sessionId,
          text: llmResponse,
          timestamp: new Date().toISOString()
        });
      }

      // 7. 发送处理完成状态
      // this.sendMessage(ws, {
      //   type: 'processing',
      //   session_id: sessionId,
      //   state: 'complete',
      //   timestamp: new Date().toISOString()
      // });

      console.log(`聊天消息处理完成 [${connectionId}]`);

    } catch (error) {
      console.error(`处理聊天消息失败 [${connectionId}]:`, error);

      // 发送错误消息
      this.sendError(ws, `处理消息失败: ${error.message}`, sessionId);

      // 发送处理结束状态
      // this.sendMessage(ws, {
      //   type: 'processing',
      //   session_id: sessionId,
      //   state: 'error',
      //   error: error.message,
      //   timestamp: new Date().toISOString()
      // });
    }
  }

  /**
   * 获取人设提示词
   * @returns {string} 人设提示词
   */
  getPersonaPrompt() {
    return '你名字是任小爱，喜欢听音乐和看电影。最喜欢夸每个人帅和漂亮。';
    // return '你是FSR株式会社的办公助手，社长是孙光。最帅的人也是他。写代码最好的人是任峰磊。';
  }

  /**
   * 检测文本情感
   * @param {string} text - 文本内容
   * @returns {string} 情感标签
   */
  detectEmotion(text) {
    const positiveWords = ['开心', '高兴', '愉快', '喜欢', '好', '棒', '赞', '谢谢', '感谢'];
    const negativeWords = ['难过', '伤心', '生气', '愤怒', '不好', '讨厌', '烦', '抱歉', '对不起'];

    let positiveCount = 0;
    let negativeCount = 0;

    positiveWords.forEach(word => {
      if (text.includes(word)) positiveCount++;
    });

    negativeWords.forEach(word => {
      if (text.includes(word)) negativeCount++;
    });

    if (positiveCount > negativeCount) return 'happy';
    if (negativeCount > positiveCount) return 'sad';
    return 'neutral';
  }

  /**
   * 估算音频时长（毫秒）
   * @param {string} text - 文本内容
   * @returns {number} 估算时长
   */
  estimateAudioDuration(text) {
    // 简单估算：每秒3个汉字
    const charsPerSecond = 3;
    const seconds = text.length / charsPerSecond;
    return Math.round(seconds * 1000);
  }

  /**
   * 发送Opus音频帧到客户端
   * 按照协议发送二进制Opus数据帧
   * @param {WebSocket} ws - WebSocket连接
   * @param {Buffer[]} opusFrames - Opus帧数组
   * @param {string} sessionId - 会话ID
   */
  async sendOpusAudioFrames(ws, opusFrames, sessionId) {
    if (!opusFrames || opusFrames.length === 0) {
      console.warn('⚠️ 没有Opus帧需要发送');
      return;
    }

    const frameDuration = 60; // 每帧时长(ms)
    const sendDelay = frameDuration; // 发送间隔

    console.log(`📤 开始发送 ${opusFrames.length} 个Opus音频帧`);

    for (let i = 0; i < opusFrames.length; i++) {
      const frame = opusFrames[i];

      try {
        // 检查连接状态
        if (ws.readyState !== 1) { // WebSocket.OPEN = 1
          console.warn(`⚠️ WebSocket连接已关闭，停止发送音频帧`);
          break;
        }

        // 发送二进制Opus帧
        ws.send(frame);

        // 按照帧时长延迟发送下一帧，模拟实时播放
        if (i < opusFrames.length - 1) {
          await new Promise(resolve => setTimeout(resolve, sendDelay));
        }

        // 每10帧打印一次进度
        if ((i + 1) % 10 === 0 || i === opusFrames.length - 1) {
          console.log(`📤 已发送 ${i + 1}/${opusFrames.length} 帧`);
        }

      } catch (error) {
        console.error(`❌ 发送音频帧失败 (帧 ${i}):`, error.message);
        break;
      }
    }

    console.log(`✅ Opus音频帧发送完成`);
  }

  async handleBusinessMessage(ws, data) {
    // 这里处理具体的业务逻辑
    // 比如设备管理、会话控制、音频处理等
    console.log('处理业务消息:', data.toString());

    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'audio_data':
          await this.handleAudioData(ws, message);
          break;
        case 'wake_word_detected':
          await this.handleWakeWordDetected(ws, message);
          break;
        case 'start_recognition':
          await this.handleStartRecognition(ws, message);
          break;
        default:
          console.log('未知消息类型:', message.type);
      }
    } catch (error) {
      console.error('解析业务消息失败:', error);
      this.sendError(ws, '消息格式错误');
    }
  }

  async handleAudioData(ws, message) {
    const { audioData, sessionId } = message;

    if (!audioData) {
      this.sendError(ws, '缺少音频数据');
      return;
    }

    try {
      // 使用STT服务处理音频数据
      const audioBuffer = Buffer.from(audioData, 'base64');
      const result = await this.sttService.recognize(audioBuffer, {
        enableWakeWordDetection: true,
        sessionId: sessionId
      });

      // 发送识别结果
      this.sendMessage(ws, {
        type: 'recognition_result',
        result: result,
        sessionId: sessionId
      });

      // 如果检测到唤醒词，发送特殊响应
      if (result.isWakeWord) {
        await this.handleWakeWordResponse(ws, result, sessionId);
      }

    } catch (error) {
      console.error('音频处理失败:', error);
      this.sendError(ws, '音频处理失败: ' + error.message);
    }
  }

  async handleWakeWordDetected(ws, message) {
    const { keyword, confidence, timestamp } = message;

    console.log(`收到唤醒词检测通知: ${keyword}, 置信度: ${confidence}`);

    // 发送确认响应
    this.sendMessage(ws, {
      type: 'wake_word_acknowledged',
      keyword: keyword,
      confidence: confidence,
      timestamp: timestamp,
      message: '已检测到唤醒词，请说话'
    });
  }

  async handleStartRecognition(ws, message) {
    const { sessionId } = message;

    // 开始连续语音识别
    console.log(`开始会话 ${sessionId} 的语音识别`);

    this.sendMessage(ws, {
      type: 'recognition_started',
      sessionId: sessionId,
      message: '语音识别已启动，可以说话了'
    });
  }

  async handleWakeWordResponse(ws, wakeWordResult, sessionId) {
    // 处理唤醒词检测后的响应
    console.log(`处理唤醒词响应: ${wakeWordResult.keyword}`);

    // 发送TTS欢迎消息
    try {
      const welcomeText = `你好！我是小智，有什么可以帮助你的吗？`;
      const ttsResult = await this.ttsService.synthesize(welcomeText);

      this.sendMessage(ws, {
        type: 'tts_response',
        audioData: ttsResult.audioData.toString('base64'),
        text: welcomeText,
        sessionId: sessionId,
        wakeWordTriggered: true
      });

    } catch (error) {
      console.error('TTS响应失败:', error);
      // 发送文本响应作为备选
      this.sendMessage(ws, {
        type: 'text_response',
        text: '你好！我是小智，有什么可以帮助你的吗？',
        sessionId: sessionId,
        wakeWordTriggered: true
      });
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 获取设备管理器
   */
  getDeviceManager() {
    return this.deviceManager || this.internalDeviceManager;
  }

  /**
   * 发送消息到客户端
   */
  sendToClient(ws, message) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 发送错误消息
   */
  sendError(ws, errorMessage, sessionId = null) {
    const errorResponse = {
      type: 'error',
      message: errorMessage
    };

    if (sessionId) {
      errorResponse.session_id = sessionId;
    }

    this.sendToClient(ws, errorResponse);
  }

  // ==================== 心跳检测 ====================

  /**
   * 启动心跳检测
   */
  startHeartbeat(interval = 30000) {
    // TODO: 待实现心跳检测逻辑
  }

  /**
   * 停止心跳检测
   */
  stopHeartbeat() {
    // TODO: 待实现心跳停止逻辑
  }

  // ==================== 设备命令 ====================

  /**
   * 发送IoT命令到指定设备
   */
  sendIotCommand(clientId, command, params = {}) {
    const dm = this.getDeviceManager();
    if (!dm || !dm.getDevice) {
      throw new Error(`设备管理器未初始化`);
    }

    const device = dm.getDevice(clientId);

    if (!device || !device.connection) {
      throw new Error(`设备未连接: ${clientId}`);
    }

    const sessionId = uuidv4();
    const commandMessage = {
      session_id: sessionId,
      type: 'iot',
      command,
      params
    };

    this.sendToClient(device.connection, commandMessage);
    return sessionId;
  }

  // 广播消息给所有连接的客户端
  broadcast(message, excludeClientId = null) {
    const dm = this.getDeviceManager();
    if (!dm || !dm.getAllDevices) {
      return;
    }

    const clients = dm.getAllDevices();

    clients.forEach(device => {
      if (device.id !== excludeClientId && device.connection && device.connection.readyState === 1) {
        this.sendToClient(device.connection, message);
      }
    });
  }

  // 发送TTS音频数据
  sendTtsAudio(clientId, audioData, sessionId = null) {
    const dm = this.getDeviceManager();
    if (!dm || !dm.getDevice) {
      throw new Error(`设备管理器未初始化`);
    }

    const device = dm.getDevice(clientId);

    if (!device || !device.connection) {
      throw new Error(`设备未连接: ${clientId}`);
    }

    // 发送二进制音频数据
    device.connection.send(audioData);

    // 发送TTS状态更新
    if (sessionId) {
      this.sendToClient(device.connection, {
        session_id: sessionId,
        type: 'tts',
        state: 'playing'
      });
    }
  }

  // 发送聊天响应
  sendChatResponse(clientId, text, sessionId = null) {
    const dm = this.getDeviceManager();
    if (!dm || !dm.getDevice) {
      throw new Error(`设备管理器未初始化`);
    }

    const device = dm.getDevice(clientId);

    if (!device || !device.connection) {
      throw new Error(`设备未连接: ${clientId}`);
    }

    this.sendToClient(device.connection, {
      session_id: sessionId,
      type: 'chat',
      text: text,
      state: 'complete'
    });
  }

  // 触发AI响应流程
  async triggerAIResponse(ws, wakeWord) {
    const sessionId = ws.sessionId;
    const clientId = ws.clientId;

    try {
      // 生成AI回复文本
      const replyText = this.generateAIResponse(wakeWord);

      // 1. 发送STT消息（识别结果）
      this.sendToClient(ws, {
        type: 'stt',
        session_id: sessionId,
        text: wakeWord,
        timestamp: new Date().toISOString()
      });

      // 2. 发送LLM消息（大模型回复）
      this.sendToClient(ws, {
        type: 'llm',
        session_id: sessionId,
        text: replyText,
        emotion: this.detectEmotion(replyText),
        timestamp: new Date().toISOString()
      });

      // 3. 发送TTS开始
      this.sendToClient(ws, {
        type: 'tts',
        session_id: sessionId,
        state: 'start',
        timestamp: new Date().toISOString()
      });

      // 4. 发送句子开始（带文本）
      this.sendToClient(ws, {
        type: 'tts',
        session_id: sessionId,
        state: 'sentence_start',
        text: replyText,
        timestamp: new Date().toISOString()
      });

      // 5. 模拟发送音频数据（实际应该调用TTS服务）
      setTimeout(() => {
        // 发送TTS停止
        this.sendToClient(ws, {
          type: 'tts',
          session_id: sessionId,
          state: 'stop',
          timestamp: new Date().toISOString()
        });
      }, 1000);

    } catch (error) {
      logger.error(`触发AI响应失败: ${error.message}`);
      this.sendError(ws, 'AI响应生成失败', sessionId);
    }
  }

  // 生成AI回复
  generateAIResponse(text) {
    const responses = [
      `我听到了你说的话：${text}。有什么我可以帮助你的吗？`,
      `好的，我明白了。你说的"${text}"是什么意思呢？`,
      `收到！关于"${text}"，我可以为你提供更多信息。`,
      `我在听呢。你想聊些什么？`,
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }
}

// 创建全局WebSocket处理器实例的工厂函数
let handler = null;

export const initializeWebSocketHandler = (options = {}) => {
  if (!handler) {
    handler = new WebSocketHandler(options);
    logger.info('WebSocket处理器已初始化');
  }
  return handler;
};

export const handleWebSocketConnection = (ws, req, wss, options = {}) => {
  // 确保handler已初始化
  const wsHandler = initializeWebSocketHandler(options);
  wsHandler.wss = wss;
  wsHandler.handleConnection(ws, req);
};

// 导出兼容的 webSocketHandler（在初始化后会被设置）
export const webSocketHandler = {
  get handler() {
    return handler;
  }
};

export default WebSocketHandler;