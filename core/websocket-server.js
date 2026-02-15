const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { AuthManager, AuthenticationError } = require('./auth');
const { logger } = require('../utils/logger');

class WebSocketServer {
  constructor(config, llmService = null, ttsService = null) {
    this.config = config;
    this.llmService = llmService; // LLM服务
    this.ttsService = ttsService; // TTS服务
    this.connections = new Map(); // 存储活跃连接
    this.authManager = null;
    this.setupAuth();
  }

  setupAuth() {
    const serverConfig = this.config.server || {};
    const authConfig = serverConfig.auth || {};
    
    if (authConfig.enabled) {
      this.authManager = new AuthManager(
        serverConfig.auth_key || 'default_secret_key',
        authConfig.expire_seconds
      );
      this.authManager.setAuthEnabled(true);
      
      // 设置白名单设备
      if (authConfig.allowed_devices && Array.isArray(authConfig.allowed_devices)) {
        this.authManager.setAllowedDevices(authConfig.allowed_devices);
      }
    }
  }

  /**
   * 处理新WebSocket连接
   * @param {WebSocket} ws - WebSocket实例
   * @param {http.IncomingMessage} req - HTTP请求对象
   */
  handleConnection(ws, req) {
    const connectionId = uuidv4();
    const clientIp = req.socket.remoteAddress;
    
    logger.info(`新的WebSocket连接: ${connectionId} 来自 ${clientIp}`);

    // 设置连接基本信息
    ws.connectionId = connectionId;
    ws.clientIp = clientIp;
    ws.connectedAt = new Date();
    ws.isAuthenticated = false;
    ws.deviceId = null;
    ws.clientId = null;

    // 处理认证
    if (this.authManager) {
      const authResult = this.authManager.authenticate(req.headers);
      if (!authResult.success) {
        logger.warn(`认证失败 [${connectionId}]: ${authResult.error}`);
        ws.send(JSON.stringify({
          type: 'error',
          message: authResult.error || 'Authentication failed'
        }));
        ws.close(1008, 'Authentication failed');
        return;
      }
      ws.isAuthenticated = true;
      ws.deviceId = req.headers['device-id'] || req.headers['device_id'];
      ws.clientId = req.headers['client-id'] || req.headers['client_id'];
      logger.info(`认证成功 [${connectionId}] 设备: ${ws.deviceId}`);
    }

    // 存储连接
    this.connections.set(connectionId, ws);

    // 发送连接确认
    ws.send(JSON.stringify({
      type: 'connection_ack',
      connectionId: connectionId,
      timestamp: new Date().toISOString(),
      authenticated: ws.isAuthenticated
    }));

    // 处理消息
    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });

    // 处理连接关闭
    ws.on('close', (code, reason) => {
      logger.info(`WebSocket连接关闭: ${connectionId}, 代码: ${code}, 原因: ${reason}`);
      this.connections.delete(connectionId);
    });

    // 处理错误
    ws.on('error', (error) => {
      logger.error(`WebSocket错误 [${connectionId}]:`, error);
    });
  }

  /**
   * 处理WebSocket消息
   * @param {WebSocket} ws - WebSocket实例
   * @param {Buffer|string} data - 消息数据
   */
  handleMessage(ws, data) {
    try {
      let message;
      
      // 尝试解析为JSON，如果不是JSON则作为二进制数据处理
      try {
        if (Buffer.isBuffer(data)) {
          message = JSON.parse(data.toString());
        } else {
          message = JSON.parse(data);
        }
        // 如果成功解析为JSON，按JSON消息处理
        logger.debug(`收到JSON消息 [${ws.connectionId}]:`, message);
      } catch (jsonError) {
        // 如果解析失败，作为二进制数据处理
        logger.debug(`收到二进制数据 [${ws.connectionId}]: ${data.length} bytes`);
        this.handleBinaryMessage(ws, data);
        return;
      }

      logger.debug(`收到消息 [${ws.connectionId}]:`, message);

      switch (message.type) {
        case 'hello':
          this.handleHello(ws, message);
          break;
        case 'listen':
          this.handleListen(ws, message);
          break;
        case 'abort':
          this.handleAbort(ws, message);
          break;
        case 'iot':
          this.handleIot(ws, message);
          break;
        case 'chat':
          this.handleChat(ws, message);
          break;
        case 'ping':
          this.handlePing(ws, message);
          break;
        case 'connection_ack':
          this.handleConnectionAck(ws, message);
          break;
        case 'stt':
          this.handleStt(ws, message);
          break;
        case 'llm':
          this.handleLlm(ws, message);
          break;
        case 'tts':
          this.handleTts(ws, message);
          break;
        case 'system':
          this.handleSystem(ws, message);
          break;
        case 'custom':
          this.handleCustom(ws, message);
          break;
        default:
          // 忽略未知消息类型，不返回错误
          logger.info(`收到未知消息类型: ${message.type}, 忽略处理`);
      }
    } catch (error) {
      logger.error(`处理消息失败 [${ws.connectionId}]:`, error);
      this.sendError(ws, '消息处理失败');
    }
  }

  handleHello(ws, message) {
    const { version, transport, audio_params, device_id, device_name, device_mac, features } = message;
    
    logger.info(`收到hello消息: device_id=${device_id}, device_name=${device_name}, device_mac=${device_mac}`);
    
    // 兼容没有version和transport字段的hello消息
    if (version && version !== 1) {
      this.sendError(ws, '不支持的协议版本');
      return;
    }
    if (transport && transport !== 'websocket') {
      this.sendError(ws, '不支持的传输方式');
      return;
    }

    // 保存设备信息
    ws.deviceId = device_id;
    ws.deviceName = device_name;
    ws.deviceMac = device_mac;
    ws.features = features;
    
    // 生成session_id
    const sessionId = uuidv4();
    ws.sessionId = sessionId;
    
    ws.audioParams = audio_params;
    
    // 返回hello响应，包含session_id
    this.sendMessage(ws, {
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

    logger.info(`设备握手成功: ${ws.connectionId}, session_id: ${sessionId}`);
  }

  handleListen(ws, message) {
    const { session_id, state, mode, text } = message;
    
    if (!state) {
      this.sendError(ws, '缺少监听状态');
      return;
    }

    logger.info(`监听状态更新 [${ws.connectionId}]: state=${state}, mode=${mode}, text=${text}`);

    // 保存session_id
    if (session_id) {
      ws.sessionId = session_id;
    }

    // 如果是detect状态（唤醒词检测），触发AI响应
    if (state === 'detect') {
      const wakeWord = text || '你好';
      logger.info(`检测到唤醒词: ${wakeWord}`);
      
      // 触发AI对话流程（包含stt、llm、tts消息）
      this.triggerAIResponse(ws, wakeWord);
      return;
    }
    
    // 非detect状态才发送listen确认
    this.sendMessage(ws, {
      type: 'listen',
      session_id: session_id || ws.sessionId,
      state: state,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 触发AI响应流程
   */
  async triggerAIResponse(ws, wakeWord) {
    const sessionId = ws.sessionId;
    const connectionId = ws.connectionId;
    
    try {
      // 生成AI回复
      const replyText = await this.generateAIResponse(connectionId, wakeWord);
      
      // 1. 发送STT消息（识别结果）
      this.sendMessage(ws, {
        type: 'stt',
        session_id: sessionId,
        text: wakeWord,
        timestamp: new Date().toISOString()
      });
      
      // 2. 发送LLM消息（大模型回复）
      this.sendMessage(ws, {
        type: 'llm',
        session_id: sessionId,
        text: replyText,
        emotion: this.detectEmotion(replyText),
        timestamp: new Date().toISOString()
      });

      // 3. 发送TTS开始
      this.sendMessage(ws, {
        type: 'tts',
        session_id: sessionId,
        state: 'start',
        timestamp: new Date().toISOString()
      });
      
      // 4. 发送句子开始（带文本）
      this.sendMessage(ws, {
        type: 'tts',
        session_id: sessionId,
        state: 'sentence_start',
        text: replyText,
        timestamp: new Date().toISOString()
      });
      
      // 5. 生成并发送TTS音频
      try {
        if (this.ttsService) {
          logger.info(`正在生成TTS语音: ${replyText}`);
          const audioData = await this.ttsService.synthesize(replyText);
          // 发送音频数据
          ws.send(audioData);
          logger.info(`TTS音频已发送: ${audioData.length} bytes`);
        } else {
          // 没有TTS服务，发送静音帧
          const silentOpus = this.createSilentOpusFrame();
          ws.send(silentOpus);
        }
      } catch (ttsError) {
        logger.error(`TTS生成失败XXXXX: ${ttsError.message}`);
        logger.error(`TTS生成失败: ${ttsError.message}`);
        // TTS失败时发送静音帧
        const silentOpus = this.createSilentOpusFrame();
        ws.send(silentOpus);
      }
      
      // 6. 发送TTS停止
      setTimeout(() => {
        this.sendMessage(ws, {
          type: 'tts',
          session_id: sessionId,
          state: 'stop',
          timestamp: new Date().toISOString()
        });
      }, 500);

    } catch (error) {
      logger.error(`触发AI响应失败: ${error.message}`);
    }
  }

  /**
   * 创建静音Opus帧（用于模拟TTS）
   */
  createSilentOpusFrame() {
    // Opus静音帧（基于OTEP格式）
    // 简单实现：直接发送一个小的二进制数据
    // 格式：type(1) + reserved(1) + size(2) + payload
    const payload = Buffer.from([0x00, 0x00, 0x00, 0x00]); // 4字节的静音数据
    const header = Buffer.alloc(4);
    header[0] = 0x00; // type: OPUS
    header[1] = 0x00; // reserved
    header.writeUInt16BE(payload.length, 2); // payload size
    return Buffer.concat([header, payload]);
  }

  handleAbort(ws, message) {
    const { session_id, reason } = message;
    logger.info(`会话终止 [${ws.connectionId}]: ${reason || '未知原因'}`);

    // 回复确认
    this.sendMessage(ws, {
      type: 'abort',
      session_id: session_id || ws.sessionId,
      timestamp: new Date().toISOString()
    });
  }

  handleIot(ws, message) {
    const { descriptors, states } = message;
    logger.info(`收到IoT消息 [${ws.connectionId}]: descriptors=${!!descriptors}, states=${!!states}`);
  }

  handleChat(ws, message) {
    const { session_id, text, state } = message;
    
    if (state === 'complete' && text) {
      logger.info(`收到聊天消息 [${ws.connectionId}]: ${text}`);
      // 处理聊天消息并生成回复
      this.handleChatMessage(ws, text);
    } else {
      // 监听开始
      logger.info(`聊天状态 [${ws.connectionId}]: state=${state}`);
    }
  }

  /**
   * 处理聊天消息并生成回复
   */
  async handleChatMessage(ws, text) {
    const sessionId = ws.sessionId;
    const connectionId = ws.connectionId;
    
    try {
      // 调用LLM生成回复
      const replyText = await this.generateAIResponse(connectionId, text);
      
      // 只发送LLM消息，不单独发送stt
      this.sendMessage(ws, {
        type: 'llm',
        session_id: sessionId,
        text: replyText,
        emotion: this.detectEmotion(replyText),
        timestamp: new Date().toISOString()
      });

      // 开始TTS
      this.sendMessage(ws, {
        type: 'tts',
        session_id: sessionId,
        state: 'start',
        timestamp: new Date().toISOString()
      });

      // 模拟发送音频数据（实际应该调用TTS服务生成音频）
      // 这里发送句子开始的标记
      this.sendMessage(ws, {
        type: 'tts',
        session_id: sessionId,
        state: 'sentence_start',
        text: replyText,
        timestamp: new Date().toISOString()
      });

      // 模拟音频发送完成后停止TTS
      setTimeout(() => {
        this.sendMessage(ws, {
          type: 'tts',
          session_id: sessionId,
          state: 'stop',
          timestamp: new Date().toISOString()
        });
      }, replyText.length * 100); // 简单估算播放时间

    } catch (error) {
      logger.error(`生成AI回复失败: ${error.message}`);
      this.sendError(ws, '生成回复失败');
    }
  }

  /**
   * 生成AI回复
   */
  async generateAIResponse(connectionId, text) {
    // 如果配置了LLM服务，使用真正的LLM
    if (this.llmService && this.llmService.isConfigured()) {
      try {
        logger.info(`调用LLM服务生成回复: ${text}`);
        const response = await this.llmService.chat(connectionId, text);
        logger.info(`LLM回复: ${response}`);
        return response;
      } catch (error) {
        logger.error(`LLM调用失败: ${error.message}`);
        // LLM失败时降级使用模拟回复
      }
    }
    
    // 降级：使用模拟回复
    const responses = [
      `我听到了你说的话：${text}。有什么我可以帮助你的吗？`,
      `好的，我明白了。你说的"${text}"是什么意思呢？`,
      `收到！关于"${text}"，我可以为你提供更多信息。`,
      `我在听呢。你想聊些什么？`,
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * 检测文本情感
   */
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

  handlePing(ws, message) {
    this.sendMessage(ws, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 处理连接确认消息
   */
  handleConnectionAck(ws, message) {
    const { connectionId, authenticated } = message;
    
    logger.info(`收到连接确认: connectionId=${connectionId}, authenticated=${authenticated}`);
    
    // 更新连接状态
    ws.isAuthenticated = authenticated || true;
    ws.connectionAck = true;
    
    // 可以发送一个确认响应
    this.sendMessage(ws, {
      type: 'connection_confirmed',
      connectionId: ws.connectionId,
      timestamp: new Date().toISOString()
    });
  }

  handleBinaryMessage(ws, data) {
    logger.debug(`收到二进制数据: ${data.length} bytes (${ws.connectionId})`);
    // 这里处理音频数据
    this.handleAudioData(ws, data);
  }

  handleChatMessage(ws, text) {
    // 模拟LLM响应
    const response = `收到您的消息: "${text}"。我是小智，很高兴为您服务！`;
    
    this.sendMessage(ws, {
      type: 'chat',
      text: response,
      timestamp: new Date().toISOString()
    });
  }

  handleAudioData(ws, audioData) {
    // 这里可以集成VAD和ASR处理音频数据
    logger.debug(`处理音频数据 [${ws.connectionId}]: ${audioData.length} bytes`);
    
    // 模拟处理结果
    this.sendMessage(ws, {
      type: 'audio_processed',
      length: audioData.length,
      timestamp: new Date().toISOString()
    });
  }

  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, errorMessage) {
    this.sendMessage(ws, {
      type: 'error',
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 广播消息给所有连接
   * @param {Object} message - 要广播的消息
   * @param {string} excludeId - 要排除的连接ID
   */
  broadcast(message, excludeId = null) {
    const messageStr = JSON.stringify(message);
    
    this.connections.forEach((ws, connectionId) => {
      if (connectionId !== excludeId && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  /**
   * 获取连接统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      connections: Array.from(this.connections.keys()).map(id => ({
        id,
        connectedAt: this.connections.get(id).connectedAt,
        deviceId: this.connections.get(id).deviceId,
        clientIp: this.connections.get(id).clientIp
      }))
    };
  }

  /**
   * 关闭所有连接
   */
  closeAllConnections() {
    this.connections.forEach((ws, connectionId) => {
      try {
        ws.close(1001, 'Server shutting down');
      } catch (error) {
        logger.error(`关闭连接失败 [${connectionId}]:`, error);
      }
    });
    this.connections.clear();
  }

  /**
   * 处理STT消息（语音识别结果）
   * 文档: 服务器->设备端，语音转文本结果
   */
  handleStt(ws, message) {
    const { session_id, text } = message;
    logger.info(`收到STT消息: session_id=${session_id}, text=${text}`);
    // 这里可以添加STT处理逻辑
  }

  /**
   * 处理LLM消息（大模型回复）
   * 文档: 服务器->设备端，包含emotion和text字段
   */
  handleLlm(ws, message) {
    const { session_id, text, emotion } = message;
    logger.info(`收到LLM消息: session_id=${session_id}, emotion=${emotion}, text=${text}`);
    // 这里可以添加LLM处理逻辑
  }

  /**
   * 处理TTS消息（语音合成）
   * 文档: 服务器->设备端，state: start/stop/sentence_start
   */
  handleTts(ws, message) {
    const { session_id, state, text } = message;
    logger.info(`收到TTS消息: session_id=${session_id}, state=${state}, text=${text}`);
    // 这里可以添加TTS处理逻辑
  }

  /**
   * 处理System消息（系统命令）
   * 文档: 服务器->设备端，支持command: reboot等
   */
  handleSystem(ws, message) {
    const { session_id, command } = message;
    logger.info(`收到System消息: session_id=${session_id}, command=${command}`);
    
    if (command === 'reboot') {
      logger.info('收到重启命令');
      // 可以在这里处理重启逻辑
    }
  }

  /**
   * 处理Custom消息（自定义消息）
   * 文档: 自定义消息，当CONFIG_RECEIVE_CUSTOM_MESSAGE启用时支持
   */
  handleCustom(ws, message) {
    const { session_id, payload } = message;
    logger.info(`收到Custom消息: session_id=${session_id}, payload=${JSON.stringify(payload)}`);
  }
}

module.exports = WebSocketServer;