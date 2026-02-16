import { v4 as uuidv4 } from 'uuid';
import DeviceManager from '../managers/deviceManager.js';
import { logger } from '../utils/logger.js';

class WebSocketHandler {
  constructor(wss, options = {}) {
    this.wss = wss;
    this.deviceManager = new DeviceManager();
    this.heartbeatInterval = null;

    // 接受外部传入的服务
    this.llmService = options.llmService;
    this.ttsService = options.ttsService;

    logger.info('WebSocket处理器初始化完成');
    if (this.llmService) {
      logger.info(`LLM服务: ${this.llmService.provider || '未配置'}`);
    }
    if (this.ttsService) {
      logger.info(`TTS服务: ${this.ttsService.provider || '未配置'}`);
    }
  }

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
    ws.audioParams = null;

    // 处理接收到的消息
    ws.on('message', (data) => {
      try {
        // 首先尝试解析为JSON
        let message;
        try {
          message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
          return;
        } catch (jsonError) {
          // 如果JSON解析失败，则认为是二进制音频数据
          if (data instanceof Buffer || data instanceof Uint8Array) {
            this.handleAudioData(ws, data);
            return;
          }
          throw jsonError; // 如果都不是，抛出原始错误
        }
      } catch (error) {
        logger.error(`解析消息失败:`, error);
        this.sendError(ws, '消息格式错误', null);
      }
    });

    // 处理连接关闭
    ws.on('close', () => {
      logger.info(`WebSocket连接关闭: ${clientId}`);
      this.handleClientDisconnect(ws);
    });

    // 处理连接错误
    ws.on('error', (error) => {
      logger.error(`WebSocket错误 [${clientId}]:`, error);
    });

    // 心跳检测
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // 注册到设备管理器
    this.deviceManager.addDevice({
      id: clientId,
      ip: clientIp,
      connection: ws,
      connectedAt: new Date()
    });
  }

  handleMessage(ws, message) {
    const { type, session_id, ...payload } = message;

    logger.debug(`收到消息 [${ws.clientId}]:`, message);

    // 更新会话ID
    if (session_id) {
      ws.sessionId = session_id;
    }

    switch (type) {
      case 'hello':
        this.handleHello(ws, payload);
        break;

      case 'listen':
        this.handleListen(ws, payload);
        break;

      case 'abort':
        this.handleAbort(ws, payload);
        break;

      case 'iot':
        this.handleIot(ws, payload);
        break;

      case 'chat':
        this.handleChat(ws, payload);
        break;

      default:
        this.sendError(ws, `未知消息类型: ${type}`, session_id);
    }
  }

  handleHello(ws, payload) {
    const { version, transport, audio_params, device_id, device_name, device_mac, features } = payload;

    logger.info(`收到hello消息: device_id=${device_id}, device_name=${device_name}, device_mac=${device_mac}`);
    logger.debug(`Hello消息详情: version=${version}, transport=${transport}, payload=`, payload);

    // 验证必要字段 - 更宽松的验证
    if (version && version !== 1) {
      logger.warn(`警告: 不支持的协议版本 ${version}，但仍继续处理`);
      // 不直接拒绝，而是继续处理
    }
    if (transport && transport !== 'websocket') {
      logger.warn(`警告: 不支持的传输方式 ${transport}，但仍继续处理`);
      // 不直接拒绝，而是继续处理
    }

    // 保存设备信息
    ws.deviceId = device_id;
    ws.deviceName = device_name;
    ws.deviceMac = device_mac;
    ws.features = features;

    // 生成session_id
    const sessionId = uuidv4();
    ws.sessionId = sessionId;

    // 存储音频参数
    if (audio_params) {
      ws.audioParams = audio_params;
    }

    // 标记为已认证
    ws.isAuthenticated = true;

    // 发送服务器hello响应，包含session_id
    this.sendToClient(ws, {
      type: 'hello',
      session_id: sessionId,
      transport: 'websocket',
      audio_params: {
        format: 'opus',
        sample_rate: 16000,
        channels: 1,
        frame_duration: 60
      }
    });

    logger.info(`设备握手成功: ${ws.clientId}, session_id: ${sessionId}`);

    logger.info(`设备握手成功: ${ws.clientId}`);
  }

  handleListen(ws, payload) {
    const { session_id, state, mode, text } = payload;

    if (!state) {
      this.sendError(ws, '缺少监听状态', session_id || ws.sessionId);
      return;
    }

    // 保存session_id
    if (session_id) {
      ws.sessionId = session_id;
    }

    logger.info(`监听状态更新 [${ws.clientId}]: state=${state}, mode=${mode}, text=${text}`);

    // 发送listen确认响应
    this.sendToClient(ws, {
      type: 'listen',
      session_id: session_id || ws.sessionId,
      state: state,
      timestamp: new Date().toISOString()
    });

    switch (state) {
      case 'start':
        logger.info(`开始录音监听: ${ws.clientId}`);
        // 可以在这里触发STT服务
        break;

      case 'stop':
        logger.info(`停止录音监听: ${ws.clientId}`);
        break;

      case 'detect':
        logger.info(`检测到唤醒词: ${text || '未知'} (${ws.clientId})`);
        // 处理唤醒词检测，触发AI响应流程
        this.triggerAIResponse(ws, text || '你好');
        break;

      default:
        this.sendError(ws, `未知监听状态: ${state}`, session_id || ws.sessionId);
    }
  }

  handleAbort(ws, payload) {
    const { reason } = payload;

    logger.info(`终止会话 [${ws.sessionId}]: ${reason || '未知原因'} (${ws.clientId})`);

    // 可以在这里处理TTS播放终止等逻辑
  }

  handleIot(ws, payload) {
    const { descriptors, states } = payload;

    if (descriptors) {
      // 处理设备描述符
      logger.info(`收到设备描述符:`, descriptors);
      this.deviceManager.updateDevice(ws.clientId, {
        descriptors,
        lastSeen: new Date()
      });
    }

    if (states) {
      // 处理设备状态更新
      logger.info(`收到设备状态更新:`, states);
      this.deviceManager.updateDevice(ws.clientId, {
        states,
        lastSeen: new Date()
      });

      // 可以广播状态更新给其他客户端
      this.broadcast({
        type: 'iot_update',
        session_id: ws.sessionId,
        states,
        client_id: ws.clientId
      }, ws.clientId);
    }
  }

  handleChat(ws, payload) {
    const { session_id, text, state } = payload;

    // 保存session_id
    if (session_id) {
      ws.sessionId = session_id;
    }

    if (state === 'complete' && text) {
      logger.info(`收到完整聊天消息: ${text} (${ws.clientId})`);
      // 处理聊天消息并生成回复
      this.handleChatMessage(ws, text);
    } else {
      logger.info(`聊天状态更新 [${ws.clientId}]: state=${state}`);
    }
  }

  // 处理聊天消息并生成回复
  async handleChatMessage(ws, text) {
    const sessionId = ws.sessionId;
    const clientId = ws.clientId;

    try {
      console.log(`开始处理聊天消息 [${clientId}]: ${text}`);

      // 1. 发送处理开始状态
      this.sendToClient(ws, {
        type: 'processing',
        session_id: sessionId,
        state: 'start',
        timestamp: new Date().toISOString()
      });

      // 2. 调用LLM生成回复
      console.log(`调用LLM服务生成回复...`);
      let llmResponse;

      if (this.llmService && this.llmService.isConfigured()) {
        try {
          llmResponse = await this.llmService.chat(clientId, text);
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
      this.sendToClient(ws, {
        type: 'llm_response',
        session_id: sessionId,
        text: llmResponse,
        emotion: this.detectEmotion(llmResponse),
        timestamp: new Date().toISOString()
      });

      // 4. 开始TTS合成
      console.log(`开始TTS语音合成...`);
      this.sendToClient(ws, {
        type: 'tts',
        session_id: sessionId,
        state: 'start',
        timestamp: new Date().toISOString()
      });

      // 5. 调用TTS服务生成音频
      if (this.ttsService && this.ttsService.isEnabled()) {
        try {
          const ttsResult = await this.ttsService.synthesize(llmResponse);
          console.log(`TTS合成成功: ${ttsResult.length} bytes`);

          // 6. 发送TTS音频数据
          this.sendToClient(ws, {
            type: 'tts_audio',
            session_id: sessionId,
            audio_data: ttsResult.toString('base64'),
            format: 'mp3',
            sample_rate: 24000,
            text: llmResponse,
            duration: this.estimateAudioDuration(llmResponse),
            timestamp: new Date().toISOString()
          });

        } catch (ttsError) {
          console.error(`TTS合成失败: ${ttsError.message}`);
          // TTS失败时发送文本作为备选
          this.sendToClient(ws, {
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
        this.sendToClient(ws, {
          type: 'tts_disabled',
          session_id: sessionId,
          text: llmResponse,
          timestamp: new Date().toISOString()
        });
      }

      // 7. 发送处理完成状态
      this.sendToClient(ws, {
        type: 'processing',
        session_id: sessionId,
        state: 'complete',
        timestamp: new Date().toISOString()
      });

      console.log(`聊天消息处理完成 [${clientId}]`);

    } catch (error) {
      console.error(`处理聊天消息失败 [${clientId}]:`, error);

      // 发送错误消息
      this.sendError(ws, `处理消息失败: ${error.message}`, sessionId);

      // 发送处理结束状态
      this.sendToClient(ws, {
        type: 'processing',
        session_id: sessionId,
        state: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  handleAudioData(ws, audioData) {
    // 处理Opus音频数据
    logger.debug(`收到音频数据: ${audioData.length} bytes (${ws.clientId})`);
    // 这里可以集成STT服务处理音频
  }

  handleClientDisconnect(ws) {
    // 清理会话资源
    if (ws.sessionId) {
      logger.info(`会话结束: ${ws.sessionId} (${ws.clientId})`);
    }
    this.deviceManager.removeDevice(ws.clientId);
  }

  // 发送IoT命令到指定设备
  sendIotCommand(clientId, command, params = {}) {
    const device = this.deviceManager.getDevice(clientId);

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
    const clients = this.deviceManager.getAllDevices();

    clients.forEach(device => {
      if (device.id !== excludeClientId && device.connection && device.connection.readyState === 1) {
        this.sendToClient(device.connection, message);
      }
    });
  }

  // 发送TTS音频数据
  sendTtsAudio(clientId, audioData, sessionId = null) {
    const device = this.deviceManager.getDevice(clientId);

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
    const device = this.deviceManager.getDevice(clientId);

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

  // 发送消息给单个客户端
  sendToClient(ws, message) {
    if (ws.readyState === 1) { // OPEN状态
      logger.debug(`发送消息到客户端 [${ws.clientId}]:`, message);
      ws.send(JSON.stringify(message));
    } else {
      logger.warn(`无法发送消息，连接状态不正确 [${ws.clientId}]:`, ws.readyState);
    }
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
      // 这里发送静音帧作为占位符
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

  // 检测文本情感
  detectEmotion(text) {
    // 简单的情感检测
    const happyEmojis = ['😀', '😃', '😄', '😊', '🥰', '😍'];
    const sadEmojis = ['😢', '😭', '😞', '😔', '🥺'];
    const surprisedEmojis = ['😮', '😲', '😱', '🤔'];

    for (const emoji of happyEmojis) {
      if (text.includes(emoji)) return 'happy';
    }
    for (const emoji of sadEmojis) {
      if (text.includes(emoji)) return 'sad';
    }
    for (const emoji of surprisedEmojis) {
      if (text.includes(emoji)) return 'surprised';
    }

    return 'neutral';
  }

  // 发送错误消息
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

  // 开始心跳检测
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          logger.warn(`心跳超时，断开连接: ${ws.clientId}`);
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 每30秒发送一次心跳
  }

  // 停止心跳检测
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// 创建全局WebSocket处理器实例的工厂函数
let handler = null;

const initializeWebSocketHandler = (options = {}) => {
  if (!handler) {
    handler = new WebSocketHandler(null, options);
    logger.info('WebSocket处理器已初始化');
  }
  return handler;
};

const handleWebSocketConnection = (ws, req, wss, options = {}) => {
  // 确保handler已初始化
  const wsHandler = initializeWebSocketHandler(options);
  wsHandler.wss = wss;
  wsHandler.handleConnection(ws, req);
};

export { handleWebSocketConnection, handler as webSocketHandler };
