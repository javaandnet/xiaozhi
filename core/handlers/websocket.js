import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import {
  CHAT_STATES,
  CLIENT_MESSAGE_TYPES,
  LISTEN_STATES,
  SERVER_MESSAGE_TYPES,
  TTS_STATES
} from '../constants/messageTypes.js';
import DeviceManager from '../managers/device.js';
import McpService from '../services/mcp.js';
import audioConverter from '../utils/audioConverter.js';

/**
 * WebSocket 处理器
 * 负责连接管理、消息处理、业务逻辑
 * 参照Python实现：receiveAudioHandle.py
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
    this.vadService = options.vadService;
    this.mcpService = options.mcpService || new McpService();
    this.voiceprintService = options.voiceprintService;

    // 音频有效性检测默认阈值（可被设备设置覆盖）
    this.defaultAudioThresholds = {
      minMaxAmplitude: this.config.audio?.minMaxAmplitude || 500,
      minAvgAmplitude: this.config.audio?.minAvgAmplitude || 50
    };

    // 注册到设备管理器
    if (this.deviceManager && !this.deviceManager.addDevice) {
      // 使用内部的deviceManager实例
      this.internalDeviceManager = new DeviceManager();
    }

    // 添加sendMessage兼容性方法
    this.sendMessage = this.sendToClient.bind(this);

    // 初始化STT服务回调
    if (this.sttService) {
      this.sttService.setResultCallback(this._handleSttResult.bind(this));
      this.sttService.setErrorCallback(this._handleSttError.bind(this));
    }
  }

  // ==================== 连接管理 ====================

  /**
   * 处理新连接 - 设置客户端信息和事件监听
   */
  handleConnection(ws, req) {
    const clientId = req.headers['client-id'] || uuidv4();
    const deviceId = req.headers['device-id'] || uuidv4();
    const clientIp = req.socket.remoteAddress;

    // 解析URL参数
    const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
    const clientType = urlParams.get('client_type') || 'hard';
    const timestamp = urlParams.get('timestamp');

    logger.info(`新的WebSocket连接: ${clientId} 来自 ${clientIp} client_type=${clientType}, timestamp=${timestamp}`);


    // 设置客户端信息
    ws.clientId = clientId;
    ws.clientIp = clientIp;
    ws.connectedAt = new Date();
    ws.isAlive = true;
    ws.isAuthenticated = false;
    ws.sessionId = null;
    if (clientType !== "hard") {
      // 发送连接确认
      this.sendToClient(ws, {
        type: SERVER_MESSAGE_TYPES.CONNECTION_ACK,
        clientId: clientId,
        timestamp: new Date().toISOString()
      });
    }

    // 注册到设备管理器
    const dm = this.getDeviceManager();
    if (dm && dm.addDevice) {
      const deviceInfo = {
        id: ws.clientId,
        clientId: ws.clientId,
        deviceId: deviceId, // 网页客户端默认设备ID
        type: clientType, // 使用URL参数中的客户端类型
        ip: ws.clientIp,
        connection: ws, // 保存WebSocket连接引用
        connectedAt: new Date(),
        lastActivity: new Date(),
        status: 'online',
        // 添加额外的连接信息
        connectionInfo: {
          clientType: clientType,
          connectTime: timestamp ? new Date(parseInt(timestamp)) : new Date(),
          userAgent: req.headers['user-agent'] || 'hard'
        }
      };

      dm.addDevice(deviceInfo);
      logger.info(`设备注册成功: ${deviceInfo.deviceId} (${deviceInfo.clientId}), 类型: ${clientType}, 状态: ${deviceInfo.status}, 连接: ${!!deviceInfo.connection}`);
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

    // 处理MCP客户端断开
    if (this.mcpService) {
      this.mcpService.handleDeviceDisconnect(ws.clientId);
    }

    if (ws.sessionId) {
      logger.info(`会话结束: ${ws.sessionId} (${ws.clientId})`);
    }
  }

  /**
   * 处理MCP消息
   */
  async handleMcpMessage(ws, payload) {
    if (this.mcpService) {
      await this.mcpService.handleMcpMessage(ws, payload);
    } else {
      console.warn('MCP服务未初始化');
    }
  }

  /**
   * 发送MCP初始化消息到设备
   */
  sendMcpInitialize(ws) {
    if (this.mcpService) {
      this.mcpService.sendMcpInitializeMessage(ws);
    }
  }

  /**
   * 获取可用的MCP工具列表
   */
  getMcpTools() {
    if (this.mcpService) {
      return this.mcpService.getFunctionDescriptions();
    }
    return [];
  }

  /**
   * 处理消息
   */
  async handleMessage(ws, data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      // 如果不是JSON，可能是二进制音频数据
      await this.handleBinaryData(ws, data);
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
      case CLIENT_MESSAGE_TYPES.HELLO:
      case CLIENT_MESSAGE_TYPES.LISTEN:
      case CLIENT_MESSAGE_TYPES.ABORT:
      case CLIENT_MESSAGE_TYPES.IOT:
      case CLIENT_MESSAGE_TYPES.CHAT:
        await this.handleProtocolMessage(ws, type, payload);
        break;
      case CLIENT_MESSAGE_TYPES.MCP:
        // console.log(`处理MCP消息 [${ws.clientId}]`);
        await this.handleMcpMessage(ws, payload);
        break;
      case CLIENT_MESSAGE_TYPES.START_RECOGNITION:
        console.log(`处理开始识别请求 [${ws.clientId}]`);
        this.sendMessage(ws, {
          type: SERVER_MESSAGE_TYPES.RECOGNITION_STARTED,
          sessionId: ws.sessionId,
          message: '语音识别已启动，可以说话了'
        });
        break;
      case CLIENT_MESSAGE_TYPES.AUDIO_DATA:
        console.log(`处理音频数据 [${ws.clientId}]: ${payload.audioData?.length || 0} bytes`);
        this.handleAudioData(ws, payload);
        break;
      case CLIENT_MESSAGE_TYPES.WAKE_WORD_DETECTED:
        console.log(`处理唤醒词检测通知 [${ws.clientId}]: ${payload.keyword}`);
        this.handleWakeWordDetected(ws, payload);
        break;
      case CLIENT_MESSAGE_TYPES.FRIEND:
        console.log(`处理好友消息 [${ws.clientId}]: 发送给 ${payload.clientid}`);
        await this.handleFriendMessage(ws, payload);
        break;
      default:
        console.warn(`未知消息类型: ${type}`);
    }
  }

  /**
   * 处理二进制数据（音频数据）
   * 参照Python: receiveAudioHandle.handleAudioMessage
   */
  async handleBinaryData(ws, data) {
    logger.debug(`收到二进制音频数据: ${data.length} bytes (${ws.clientId})`);

    // 特殊处理：空帧表示录音结束
    if (data.length === 0) {
      logger.info(`📥 收到空帧，录音结束信号`);
      const sessionId = ws.sessionId;
      if (sessionId && this.sttService) {
        const sttSession = this.sttService.getSession(sessionId);
        const bufferCount = sttSession?.audioBuffer?.length || 0;
        logger.info(`📥 空帧触发识别: sessionId=${sessionId}, 缓冲帧数=${bufferCount}`);
        if (bufferCount >= 15) {
          await this._triggerSttRecognition(ws, sessionId);
        } else {
          logger.warn(`音频数据不足(${bufferCount}帧)，跳过识别`);
        }
      }
      return;
    }

    if (!this.sttService) {
      logger.warn(`STT服务未初始化，无法处理音频数据`);
      return;
    }

    try {
      // 检测是否有人说话（VAD）
      const hasVoice = await this._detectVoice(ws, data);

      // 如果设备刚刚被唤醒，短暂忽略VAD检测
      if (ws.justWokenUp) {
        logger.debug(`设备刚被唤醒，忽略VAD检测`);
        setTimeout(() => { ws.justWokenUp = false; }, 2000);
        return;
      }

      // 如果检测到有人说话，且正在播放，则打斷（非手动模式）
      if (hasVoice && ws.clientIsSpeaking && ws.clientListenMode !== 'manual') {
        await this._handleAbort(ws);
      }

      // 设备长时间空闲检测，用于say goodbye（参照Python: no_voice_close_connect）
      await this._checkIdleTimeout(ws, hasVoice);

      // 确保会话存在
      let sessionId = ws.sessionId;
      if (!sessionId) {
        // 没有会话时自动创建
        const sessionResult = this.sessionManager.createSession({
          clientId: ws.clientId,
          deviceId: ws.deviceId || null
        });
        sessionId = sessionResult.sessionId;
        ws.sessionId = sessionId;
        logger.info(`自动创建会话: ${sessionId} (${ws.clientId})`);
      }

      // 确保STT服务中也有对应会话
      let sttSession = this.sttService.getSession(sessionId);
      if (!sttSession) {
        sttSession = this.sttService.createSession(sessionId, {
          listenMode: ws.clientListenMode || 'auto',
          format: ws.audioParams?.format || 'opus'
        });
        logger.debug(`创建STT会话: ${sessionId}`);
      }

      // VAD静默检测 - 参照Python: silero.py
      // 如果之前有声音，现在没有声音，且静默时间超过阈值，则触发识别
      const SILENCE_THRESHOLD_MS = 500; // 静默阈值500ms
      const now = Date.now();

      // 更新语音窗口
      ws.clientVoiceWindow = ws.clientVoiceWindow || [];
      ws.clientVoiceWindow.push(hasVoice);
      if (ws.clientVoiceWindow.length > 10) {
        ws.clientVoiceWindow = ws.clientVoiceWindow.slice(-10);
      }

      // 判断当前是否有声音（窗口内超过一半帧有声音）
      const voiceFrameCount = ws.clientVoiceWindow.filter(v => v).length;
      const clientHaveVoice = voiceFrameCount >= 5;

      logger.debug(`VAD窗口: ${voiceFrameCount}/10 帧有声音, 当前状态: ${clientHaveVoice ? '有声音' : '静默'}, 之前状态: ${ws.clientHaveVoice ? '有声音' : '静默'}`);

      // 如果之前有声音，现在没有声音，且静默时间超过阈值
      if (ws.clientHaveVoice && !clientHaveVoice) {
        const silenceDuration = now - (ws.lastVoiceTime || now);
        // logger.info(`检测到静默: ${silenceDuration}ms (阈值: ${SILENCE_THRESHOLD_MS}ms)`);
        if (silenceDuration >= SILENCE_THRESHOLD_MS) {
          logger.info(`✅ 检测到语音停止，静默时间: ${silenceDuration}ms，触发识别`);
          ws.clientVoiceStop = true;
        }
      }

      // 如果收到空帧且之前有声音，也触发识别
      if (ws.clientHaveVoice) {
        const silenceDuration = now - (ws.lastVoiceTime || now);
        if (silenceDuration >= 200) { // 200ms无有效数据
          // logger.info(`✅ 收到空帧，触发识别 (静默: ${silenceDuration}ms)`);
          ws.clientVoiceStop = true;
        }
      }

      // 更新状态
      if (clientHaveVoice) {
        ws.clientHaveVoice = true;
        ws.lastVoiceTime = now;
      }

      // 接收音频并处理
      // 调试：检查数据格式
      logger.debug(`收到音频数据类型: ${typeof data}, 是Buffer: ${Buffer.isBuffer(data)}, 是Array: ${Array.isArray(data)}, 长度: ${data?.length}`);
      if (Array.isArray(data)) {
        logger.warn(`⚠️ 收到数组格式数据，长度: ${data.length}, 第一项类型: ${typeof data[0]}`);
      }
      
      await this.sttService.receiveAudio(sessionId, data, {
        hasVoice,
        format: ws.audioParams?.format || 'opus'
      });

      // 如果检测到语音停止，触发识别
      if (ws.clientVoiceStop && ws.clientListenMode !== 'manual') {
        ws.clientVoiceStop = false;
        await this._triggerSttRecognition(ws, sessionId);
      }

    } catch (error) {
      logger.error(`处理二进制音频数据失败: ${error.message}`);
    }
  }

  // ==================== 协议消息处理 ====================

  async handleProtocolMessage(ws, type, payload) {
    // 处理原始ESP32协议消息
    switch (type) {
      case CLIENT_MESSAGE_TYPES.HELLO:
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
          type: SERVER_MESSAGE_TYPES.HELLO,
          transport: 'websocket',
          session_id: ws.sessionId,
          audio_params: ws.audioParams
        });
        // console.log(`设备握手成功: ${ws.clientId}, Session: ${ws.sessionId}`);

        // 如果设备支持MCP，发送MCP初始化消息
        if (ws.features?.mcp) {
          // console.log(`设备 ${ws.clientId} 支持MCP，发送初始化消息`);
          setTimeout(() => {
            this.sendMcpInitialize(ws);
          }, 100); // 延迟1秒发送，确保握手完成
        }
        break;

      case CLIENT_MESSAGE_TYPES.LISTEN:
        const { state: listenState, mode, text: listenText } = payload;

        // 调试日志 - 打印完整的listen消息
        logger.info(`收到listen消息 [${ws.clientId}]: state=${listenState}, mode=${mode}, payload=${JSON.stringify(payload)}`);

        // 设置监听模式
        if (mode) {
          ws.clientListenMode = mode;
          logger.debug(`客户端监听模式: ${mode}`);
        }

        if (!listenState) {
          this.sendError(ws, '缺少监听状态', ws.sessionId);
          return;
        }

        logger.info(`监听状态更新 [${ws.clientId}]: ${listenState}`);

        // 处理不同的监听状态
        if (listenState === LISTEN_STATES.START) {
          // 开始监听，清除音频状态
          ws.clientHaveVoice = false;
          ws.clientVoiceStop = false;
          if (ws.sessionId && this.sttService) {
            this.sttService.clearAudioBuffer(ws.sessionId);
          }
        } else if (listenState === LISTEN_STATES.STOP) {
          // 停止监听，触发语音识别
          logger.info(`🔴 收到手动停止消息，准备触发语音识别`);
          ws.clientVoiceStop = true;

          // 确保会话存在
          let sessionId = ws.sessionId;
          if (!sessionId) {
            const sessionResult = this.sessionManager.createSession({
              clientId: ws.clientId,
              deviceId: ws.deviceId || null
            });
            sessionId = sessionResult.sessionId;
            ws.sessionId = sessionId;
            logger.info(`手动创建会话: ${sessionId}`);
          }

          // 触发语音识别
          if (this.sttService && sessionId) {
            // 设置语音停止标志
            this.sttService.setVoiceStop(sessionId, true);

            // 获取音频缓冲区大小
            const sttSession = this.sttService.getSession(sessionId);
            const bufferCount = sttSession?.audioBuffer?.length || 0;
            logger.info(`🔴 手动停止: 音频缓冲区帧数=${bufferCount}, sessionId=${sessionId}`);

            // 触发识别处理
            await this._triggerSttRecognition(ws, sessionId);
          } else {
            logger.warn(`无法触发识别: sttService=${!!this.sttService}, sessionId=${sessionId}`);
          }
        } else if (listenState === LISTEN_STATES.DETECT) {
          // 检测模式，处理文本
          ws.clientHaveVoice = false;
          ws.clientVoiceStop = false;

          if (listenText) {
            // 直接处理文本
            await this._startToChat(ws, listenText);
          }
        }
        break;

      case CLIENT_MESSAGE_TYPES.ABORT:
        const { reason } = payload;
        console.log(`会话终止 [${ws.sessionId}]: ${reason || '未知原因'} (${ws.clientId})`);
        // 清除会话数据
        if (ws.sessionId) {
          this.sessionManager.closeSession(ws.sessionId);
          if (this.ttsService) {
            // this.ttsService.clearHistory(ws.sessionId);
          }
          if (this.sttService) {
            // this.sttService.clearHistory(ws.sessionId);
          }
        }
        break;

      case CLIENT_MESSAGE_TYPES.IOT:
        const { descriptors, states } = payload;
        console.log(`收到IoT消息 [${ws.clientId}]: descriptors=${!!descriptors}, states=${!!states}`);
        break;

      case CLIENT_MESSAGE_TYPES.CHAT:
        const { text: chatText, state: chatState } = payload;
        if (chatState === CHAT_STATES.COMPLETE && chatText) {
          console.log(`收到聊天消息 [${ws.clientId}]: ${chatText}`);
          // 转发用户消息给客户端显示
          this.sendMessage(ws, {
            type: SERVER_MESSAGE_TYPES.STT,
            session_id: ws.sessionId,
            text: chatText,
            timestamp: new Date().toISOString()
          });
          // 处理完整的聊天消息
          this.handleCompleteChatMessage(ws, chatText);
        }
        break;
      case CLIENT_MESSAGE_TYPES.MCP:
        console.log(`收到MCP消息 [${ws.clientId}]: ${JSON.stringify(payload)}`);
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


      // 2. 调用LLM生成回复
      const llmResponse = await this.generateLlmResponse(ws, text);

      // 3. 发送LLM回复消息
      this.sendLlmResponse(ws, sessionId, llmResponse);

      // 4. 调用TTS合成并发送音频
      await this.sendTtsAudio(ws, sessionId, llmResponse);

      logger.info(`聊天消息处理完成 [${connectionId}]`);

    } catch (error) {
      console.error(`处理聊天消息失败 [${connectionId}]:`, error);

      // 发送错误消息
      this.sendError(ws, `处理消息失败: ${error.message}`, sessionId);
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
   * 生成LLM回复
   * @param {string} connectionId - 连接ID
   * @param {string} text - 用户输入文本
   * @param {boolean} includePersona - 是否包含人设提示词（默认true）
   * @returns {Promise<string>} LLM回复文本
   */
  async generateLlmResponse(ws, text, includePersona = true) {
    // 构造默认回复
    const defaultResponse = `我听到了你说的"${text}"。有什么我可以帮助你的吗？`;
    let connectionId = ws.clientId;
    if (this.llmService && this.llmService.isConfigured()) {
      // 构造输入文本
      const inputText = includePersona
        ? `${this.getPersonaPrompt()}\n\n请不要生成表情。\n\n用户说: ${text}`
        : text;

      try {
        const response = await this.llmService.chat(connectionId, inputText);
        console.log(`LLM回复生成成功: ${response.substring(0, 50)}...`);
        return response;
      } catch (llmError) {
        console.error(`LLM调用失败: ${llmError.message}`);
        return defaultResponse;
      }
    } else {
      console.log(`使用默认回复: ${defaultResponse}`);
      return defaultResponse;
    }
  }

  /**
   * 获取好友消息的会话信息
   * @param {WebSocket} ws - 源WebSocket连接
   * @param {Object} targetDevice - 目标设备
   * @param {Object} messageData - 消息数据
   * @returns {{sessionId: string, text: string}} 会话ID和文本内容
   */
  getFriendMessageContext(ws, targetDevice, messageData) {
    const sessionId = ws.sessionId || this.sessionManager.createSession({ clientId: targetDevice.clientId }).sessionId;
    const text = messageData.content || messageData.text;
    return { sessionId, text };
  }

  /**
   * 发送STT文本消息
   * @param {WebSocket} ws - WebSocket连接
   * @param {string} sessionId - 会话ID
   * @param {string} text - 文本内容
   */
  sendSttResponse(ws, sessionId, text) {
    this.sendMessage(ws, {
      type: SERVER_MESSAGE_TYPES.STT,
      session_id: sessionId,
      text: text,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 发送LLM回复消息
   * @param {WebSocket} ws - WebSocket连接
   * @param {string} sessionId - 会话ID
   * @param {string} text - LLM回复文本
   */
  sendLlmResponse(ws, sessionId, text) {
    this.sendMessage(ws, {
      type: SERVER_MESSAGE_TYPES.LLM,
      session_id: sessionId,
      text: text,
      emotion: this.detectEmotion(text),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 发送TTS音频到客户端（完整的TTS流程）
   * 包含：发送TTS状态、合成音频、转换Opus帧、发送音频帧
   * @param {WebSocket} ws - WebSocket连接
   * @param {string} sessionId - 会话ID
   * @param {string} text - 要合成的文本
   * @returns {Promise<boolean>} 是否成功发送
   */
  async sendTtsAudio(ws, sessionId, text) {
    console.log(`开始TTS语音合成...`);

    // 1. 发送TTS开始状态
    this.sendMessage(ws, {
      type: SERVER_MESSAGE_TYPES.TTS,
      session_id: sessionId,
      state: TTS_STATES.START,
      timestamp: new Date().toISOString()
    });

    // 2. 调用TTS服务生成音频
    if (this.ttsService && this.ttsService.isEnabled()) {
      try {
        const ttsResult = await this.ttsService.synthesize(text);
        console.log(`✅ TTS合成完成: ${ttsResult.audio?.length || ttsResult.length} bytes`);

        // 3. 发送TTS状态消息 - sentence_start
        this.sendMessage(ws, {
          type: SERVER_MESSAGE_TYPES.TTS,
          session_id: sessionId,
          state: TTS_STATES.SENTENCE_START,
          text: text,
          timestamp: new Date().toISOString()
        });

        // 4. 将MP3音频转换为Opus帧并发送
        const audioBuffer = ttsResult.audio || ttsResult;
        const opusFrames = await audioConverter.mp3ToOpusFrames(audioBuffer);
        console.log(`🎵 Opus编码完成: ${opusFrames.length} 帧`);

        // 5. 发送Opus音频帧（二进制）
        await this.sendOpusAudioFrames(ws, opusFrames, sessionId);

        // 6. 发送TTS停止消息
        this.sendMessage(ws, {
          type: SERVER_MESSAGE_TYPES.TTS,
          session_id: sessionId,
          state: TTS_STATES.STOP,
          timestamp: new Date().toISOString()
        });

        return true;

      } catch (ttsError) {
        console.error(`❌ TTS合成失败: ${ttsError.message}`);
        // TTS失败时发送文本作为备选
        this.sendMessage(ws, {
          type: SERVER_MESSAGE_TYPES.TTS_FALLBACK,
          session_id: sessionId,
          text: text,
          error: ttsError.message,
          timestamp: new Date().toISOString()
        });
        return false;
      }
    } else {
      // TTS服务未启用时发送文本
      console.log(`TTS服务未启用，发送文本回复`);
      this.sendMessage(ws, {
        type: SERVER_MESSAGE_TYPES.TTS_DISABLED,
        session_id: sessionId,
        text: text,
        timestamp: new Date().toISOString()
      });
      return false;
    }
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

        // // 每10帧打印一次进度
        // if ((i + 1) % 10 === 0 || i === opusFrames.length - 1) {
        //   console.log(`📤 已发送 ${i + 1}/${opusFrames.length} 帧`);
        // }

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

  /**
   * 处理音频数据消息（JSON格式的audio_data消息）
   */
  async handleAudioData(ws, message) {
    const { audioData, sessionId } = message;

    if (!audioData) {
      this.sendError(ws, '缺少音频数据');
      return;
    }

    try {
      // 解码Base64音频数据
      const audioBuffer = Buffer.from(audioData, 'base64');

      // 确保有会话
      const currentSessionId = sessionId || ws.sessionId;
      if (!currentSessionId) {
        this.sendError(ws, '没有活动会话');
        return;
      }

      // 确保STT会话存在
      let sttSession = this.sttService.getSession(currentSessionId);
      if (!sttSession) {
        sttSession = this.sttService.createSession(currentSessionId, {
          listenMode: ws.clientListenMode || 'auto'
        });
      }

      // 接收音频数据
      await this.sttService.receiveAudio(currentSessionId, audioBuffer, {
        hasVoice: true,
        format: ws.audioParams?.format || 'opus'
      });

      // 发送接收确认
      this.sendMessage(ws, {
        type: SERVER_MESSAGE_TYPES.AUDIO_RECEIVED,
        sessionId: currentSessionId,
        timestamp: new Date().toISOString()
      });

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
      type: SERVER_MESSAGE_TYPES.WAKE_WORD_ACKNOWLEDGED,
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
      type: SERVER_MESSAGE_TYPES.RECOGNITION_STARTED,
      sessionId: sessionId,
      message: '语音识别已启动，可以说话了'
    });
  }

  /**
   * 处理好友消息 - 客户端间消息传递
   * @param {WebSocket} ws - 发送方WebSocket连接
   * @param {Object} payload - 消息负载 {clientid, data}
   */
  async handleFriendMessage(ws, payload) {
    const { clientid: targetClientId, data } = payload;

    // 验证参数
    if (!targetClientId) {
      this.sendError(ws, '缺少目标客户端ID', ws.sessionId);
      return;
    }

    if (data === undefined || data === null) {
      this.sendError(ws, '消息内容不能为空', ws.sessionId);
      return;
    }

    // 验证data格式 - 支持结构化数据 {type: "消息类型", ...}
    let messageData = data;
    if (typeof data === 'object' && data !== null) {
      // 已经是结构化数据，验证必需字段
      if (!data.type) {
        this.sendError(ws, '结构化消息必须包含type字段', ws.sessionId);
        return;
      }
      messageData = data;
    } else {
      // 如果是字符串或其他基本类型，包装成结构化格式
      messageData = {
        type: 'text',
        content: data
      };
    }

    // 获取目标客户端
    const dm = this.getDeviceManager();
    if (!dm || !dm.getDevice) {
      this.sendError(ws, '设备管理器未初始化', ws.sessionId);
      return;
    }

    const targetDevice = dm.getDevice(targetClientId);

    // 检查目标客户端是否存在且在线
    if (!targetDevice) {
      this.sendError(ws, `目标客户端不存在: ${targetClientId}`, ws.sessionId);
      return;
    }

    // 检查目标客户端是否存在且在线
    if (!targetDevice) {
      this.sendError(ws, `目标客户端不存在: ${targetClientId}`, ws.sessionId);
      return;
    }

    // 检查在线状态
    const isOnline = targetDevice.connection &&
      targetDevice.connection.readyState === 1 &&
      targetDevice.status === 'online';

    if (!isOnline) {
      this.sendError(ws, `目标客户端不在线: ${targetClientId}`, ws.sessionId);
      return;
    }

    // 根据消息类型进行不同处理
    const messageType = messageData.type;
    const isllm = messageData.isllm;
    try {
      // 提取公共逻辑
      const { sessionId, text } = this.getFriendMessageContext(ws, targetDevice, messageData);
      let sendText = text;
      if (isllm) {
        //generateLlmResponse
        sendText = await this.generateLlmResponse(ws, sendText);
      }
      if (messageType === 'tts') {
        // tts类型 - 转换成语音发送
        await this.sendTtsAudio(targetDevice.connection, sessionId, sendText);
      }
      else if (messageType === 'sst') {
        // sst类型 - 直接发送文本，如果是hard设备发送语音
        if (targetDevice.type === 'hard' && this.ttsService) {
          await this.sendTtsAudio(targetDevice.connection, sessionId, sendText);
        } else {
          this.sendSttResponse(targetDevice.connection, sessionId, sendText);
        }
      } else if (messageType === 'device') {
        // device类型 - 修改设备配置（如音频阈值）
        const { audio_thresholds } = messageData;

        if (!audio_thresholds) {
          this.sendError(ws, 'device消息缺少配置参数', ws.sessionId);
          return;
        }

        // 更新目标设备的音频阈值设置
        targetDevice.connection.audioThresholds = {
          minMaxAmplitude: audio_thresholds.minMaxAmplitude || this.defaultAudioThresholds.minMaxAmplitude,
          minAvgAmplitude: audio_thresholds.minAvgAmplitude || this.defaultAudioThresholds.minAvgAmplitude
        };

        logger.info(`设备 ${targetClientId} 音频阈值已更新: max=${targetDevice.connection.audioThresholds.minMaxAmplitude}, avg=${targetDevice.connection.audioThresholds.minAvgAmplitude}`);

        // 发送确认消息给发送方
        this.sendToClient(ws, {
          type: SERVER_MESSAGE_TYPES.MESSAGE,
          session_id: ws.sessionId,
          status: 'success',
          message: `设备 ${targetClientId} 配置已更新`,
          data: {
            targetClientId,
            audioThresholds: targetDevice.connection.audioThresholds
          },
          timestamp: new Date().toISOString()
        });
      } else if (messageType === 'mcp') {
        //Tool Trans
        let toolApi = messageData.name;
        if (!toolApi) {
          this.sendError(ws, `消息处理失败: No Tool`, ws.sessionId);

        }
        // 🔧 客户端工具 #1: self.get_device_status
        // 🔧 客户端工具 #2: self.audio_speaker.set_volume
        // 🔧 客户端工具 #3: self.screen.set_brightness
        // 🔧 客户端工具 #4: self.screen.set_theme
        // 🔧 客户端工具 #5: self.camera.take_photo
        // 🔧 客户端工具 #6: self.system.reconfigure_wifi
        let toolApiMap = {
          "volume": "self.audio_speaker.set_volume",
          "brightness": "self.screen.set_brightness",
          "theme": "self.screen.set_theme",
          "photo": "self.camera.take_photo",
          "wifi": "self.system.reconfigure_wifi"
        };
        toolApi = toolApiMap[toolApi];
        if (!toolApi) {
          this.sendError(ws, `消息处理失败: No Tool ${toolApi}`, ws.sessionId);
          return;
        }
        const exeCmd =
        {
          "jsonrpc": "2.0",
          "id": 3,
          "method": "tools/call",
          "params": {
            "name": toolApi, // 要调用的工具名称
            "arguments": messageData.params || {}
          }
        }
        this.sendMessage(targetDevice.connection, {
          type: SERVER_MESSAGE_TYPES.MCP,
          payload: exeCmd
        });
      }
    } catch (error) {
      console.error(`❌ 好友消息处理失败:`, error);
      this.sendError(ws, `消息处理失败: ${error.message}`, ws.sessionId);
    }

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
      type: SERVER_MESSAGE_TYPES.ERROR,
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

  /**
   * 处理SST类型好友消息 - 直接发送文本，如果是hard设备也发送语音
   */
  async handleSSTFriendMessage(ws, targetDevice, messageData, targetClientId) {
    console.log(`📝 处理SST好友消息: ${messageData.content || messageData.text}`);

    // 构造文本消息
    const textMessage = {
      type: 'stt',
      from: ws.clientId,
      session_id: ws.sessionId || this.sessionManager.createSession({ clientId: targetDevice.clientId }).sessionId,
      text: messageData.content || messageData.text,
      timestamp: new Date().toISOString()
    };

    // 如果是hard设备，也发送语音
    if (targetDevice.type === 'hard' && this.ttsService) {
      try {
        const ttsMessage = {
          type: 'tts',
          session_id: ws.sessionId || this.sessionManager.createSession({ clientId: targetDevice.clientId }).sessionId,
          text: messageData.content || messageData.text,
          timestamp: new Date().toISOString()
        };
        this.sendToClient(targetDevice.connection, ttsMessage);
        console.log(`🔊 为hard设备额外发送TTS消息`);
      } catch (error) {
        console.warn(`为hard设备发送TTS失败:`, error.message);
      }
    }
    // 发送文本消息
    this.sendToClient(targetDevice.connection, textMessage);

    // 向发送方确认
    // this.sendToClient(ws, {
    //   type: SERVER_MESSAGE_TYPES.FRIEND_ACK,
    //   to: targetClientId,
    //   data: messageData,
    //   timestamp: new Date().toISOString(),
    //   status: 'sent'
    // });

    console.log(`✅ SST好友消息处理完成: ${ws.clientId} -> ${targetClientId}`);
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

  // ==================== STT音频处理辅助方法 ====================

  /**
   * 触发STT语音识别
   * @param {WebSocket} ws - WebSocket连接
   * @param {string} sessionId - 会话ID
   */
  async _triggerSttRecognition(ws, sessionId) {
    logger.info(`🎬 开始触发语音识别: ${sessionId}`);

    if (!this.sttService) {
      logger.warn(`STT服务未初始化`);
      return;
    }

    const session = this.sttService.getSession(sessionId);
    if (!session) {
      logger.warn(`STT会话不存在: ${sessionId}`);
      return;
    }

    // 获取缓存的音频数据
    const audioBuffer = session.audioBuffer || [];

    // 清空缓冲区
    session.audioBuffer = [];
    session.voiceStop = false;

    logger.info(`📦 音频缓冲区帧数: ${audioBuffer.length}`);

    if (audioBuffer.length < 15) {
      logger.debug(`音频数据不足，跳过识别: ${audioBuffer.length} 帧`);
      return;
    }

    // ========== 调试：保存音频到文件 ==========
    let wavBufferForVoiceprint = null;
    try {
      const timestamp = Date.now();
      // const debugDir = path.join(process.cwd(), 'data', 'debug-audio');
      // if (!fs.existsSync(debugDir)) {
      //   fs.mkdirSync(debugDir, { recursive: true });
      // }

      // 合并所有 Opus 帧
      const combinedOpus = Buffer.concat(audioBuffer);

      // 保存原始 Opus 数据
      // const opusFile = path.join(debugDir, `audio-${timestamp}.opus`);
      // fs.writeFileSync(opusFile, combinedOpus);
      // logger.info(`💾 已保存 Opus 音频: ${opusFile} (${combinedOpus.length} bytes)`);

      // ========== 自动检测音频格式 ==========
      // PCM @ 16kHz, 16bit, mono, 60ms = 1920 bytes (960 samples * 2 bytes)
      // Opus 帧大小通常较小（几十到几百字节）

      // 统计大帧和小帧的数量
      let largeFrameCount = 0;
      let smallFrameCount = 0;
      let largeFrameTotalSize = 0;

      for (const frame of audioBuffer) {
        if (frame && frame.length > 500) {
          largeFrameCount++;
          largeFrameTotalSize += frame.length;
        } else if (frame && frame.length > 0) {
          smallFrameCount++;
        }
      }


      let detectedFormat = 'pcm';
      let pcmData = null;

      // 如果大帧占多数（超过30%），认为是 PCM 格式
      const totalFrames = largeFrameCount + smallFrameCount;
      const largeFrameRatio = totalFrames > 0 ? largeFrameCount / totalFrames : 0;
      const avgLargeFrameSize = largeFrameCount > 0 ? largeFrameTotalSize / largeFrameCount : 0;



      if (largeFrameRatio > 0.3 && avgLargeFrameSize > 1000) {
        detectedFormat = 'pcm';
        // logger.info(`🔍 检测到 PCM 格式 (大帧比例: ${(largeFrameRatio * 100).toFixed(0)}%, 大帧平均: ${avgLargeFrameSize.toFixed(0)} bytes)`);
        // 只使用大帧作为 PCM 数据
        const largeFrames = audioBuffer.filter(f => f && f.length > 500);
        pcmData = Buffer.concat(largeFrames);
      } else {
        detectedFormat = 'opus';
        // logger.info(`🔍 检测到 Opus 格式 (大帧比例: ${(largeFrameRatio * 100).toFixed(0)}%, 小帧: ${smallFrameCount}, 大帧: ${largeFrameCount})`);
      }
      // ========== 格式检测结束 ==========

      // 解码 Opus 为 PCM 并保存为 WAV
      try {
        let combinedPcm;

        if (detectedFormat === 'pcm') {
          // 已是 PCM，直接使用
          combinedPcm = pcmData;
          logger.info(`📊 直接使用 PCM 数据: ${combinedPcm.length} bytes`);
        } else {
          // Opus 格式，需要解码
          const pcmFrames = this.sttService._decodeOpusFrames(audioBuffer);
          if (pcmFrames.length > 0) {
            combinedPcm = Buffer.concat(pcmFrames);
          }
          detectedFormat = 'pcm';
        }

        if (combinedPcm && combinedPcm.length > 0) {
          // 检查音频数据是否有效（非静音）
          // 使用设备特定阈值或默认阈值
          const thresholds = ws.audioThresholds || this.defaultAudioThresholds;
          const audioStats = this._analyzeAudioAmplitude(combinedPcm, thresholds);
          logger.info(`📊 音频振幅分析: 最大=${audioStats.maxAmplitude}, 平均=${audioStats.avgAmplitude.toFixed(2)}, 有效=${audioStats.isValid} (阈值: max=${thresholds.minMaxAmplitude}, avg=${thresholds.minAvgAmplitude})`);

          if (!audioStats.isValid) {
            logger.warn(`⚠️ 音频数据无效（静音或振幅过低），跳过识别`);
            return;
          }

          // 创建 WAV 文件头
          const debugDir = path.join(process.cwd(), 'data', 'debug-audio');
          wavBufferForVoiceprint = this._createWavBuffer(combinedPcm, 16000, 1, 16);
          const wavFile = path.join(debugDir, `audio-${timestamp}.wav`);
          fs.writeFileSync(wavFile, wavBufferForVoiceprint);
          logger.info(`💾 已保存 WAV 音频: ${wavFile} (${wavBufferForVoiceprint.length} bytes)`);

          // 如果是 PCM 格式，直接发送给 FunASR 识别
          if (detectedFormat === 'pcm') {
            logger.info(`🎤 使用 PCM 数据直接调用 FunASR 识别...`);
            const result = await this.sttService._recognizeWithFunAsr(combinedPcm, sessionId);
            logger.info(`✅ 识别结果: ${JSON.stringify(result)}`);
            if (this.sttService.onResult && result.text) {
              this.sttService.onResult(sessionId, result);
            }
            return; // 直接返回，不再调用后面的识别
          }
        } else {
          logger.warn(`解码后没有 PCM 数据`);
        }
      } catch (decodeError) {
        logger.warn(`解码音频失败: ${decodeError.message}`);
        logger.error(decodeError.stack);
      }
    } catch (saveError) {
      logger.warn(`保存音频文件失败: ${saveError.message}`);
    }
    // ========== 调试结束 ==========

    try {
      // 并发执行 STT 识别和声纹识别
      const tasks = [];

      // STT 识别任务
      tasks.push(this.sttService._handleVoiceStop(session, audioBuffer));

      // 声纹识别任务（如果有 WAV 数据且声纹服务可用）
      if (wavBufferForVoiceprint && this.voiceprintService && this.voiceprintService.isEnabled()) {
        tasks.push(
          this.voiceprintService.identifySpeaker(wavBufferForVoiceprint, sessionId)
            .then(speakerName => {
              if (speakerName) {
                logger.info(`🎯 声纹识别结果: ${speakerName}`);
                ws.currentSpeaker = speakerName;
              }
              return speakerName;
            })
            .catch(err => {
              logger.warn(`声纹识别失败: ${err.message}`);
              return null;
            })
        );
      }

      await Promise.all(tasks);
      logger.info(`✅ 语音识别调用完成`);
    } catch (error) {
      logger.error(`❌ 语音识别失败: ${error.message}`);
      this.sendError(ws, `语音识别失败: ${error.message}`, sessionId);
    }
  }

  /**
   * 处理STT识别结果回调
   * @param {string} sessionId - 会话ID
   * @param {Object} result - 识别结果
   */
  async _handleSttResult(sessionId, result) {
    const ws = this._getWsBySessionId(sessionId);
    if (!ws) {
      logger.warn(`找不到会话对应的WebSocket连接: ${sessionId}`);
      return;
    }

    const { text, confidence, provider } = result;

    // 发送STT识别结果消息
    this.sendMessage(ws, {
      type: 'stt',
      session_id: sessionId,
      text: text,
      confidence: confidence,
      provider: provider,
      timestamp: new Date().toISOString()
    });

    // 开始聊天流程
    await this._startToChat(ws, text);
  }

  /**
   * 处理STT错误回调
   * @param {string} sessionId - 会话ID
   * @param {Error} error - 错误对象
   */
  _handleSttError(sessionId, error) {
    const ws = this._getWsBySessionId(sessionId);
    if (ws) {
      this.sendError(ws, `语音识别失败: ${error.message}`, sessionId);
    }
  }

  /**
   * 根据会话ID获取WebSocket连接
   * @param {string} sessionId - 会话ID
   * @returns {WebSocket|null}
   */
  _getWsBySessionId(sessionId) {
    if (!this.wss) return null;

    for (const client of this.wss.clients) {
      if (client.sessionId === sessionId) {
        return client;
      }
    }
    return null;
  }

  /**
   * 开始聊天流程
   * 参照Python: startToChat
   * @param {WebSocket} ws - WebSocket连接
   * @param {string} text - 用户文本
   */
  async _startToChat(ws, text) {
    // 解析JSON格式的输入（可能包含说话人信息）
    let speakerName = null;
    let languageTag = null;
    let actualText = text;

    try {
      if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        const data = JSON.parse(text);
        if (data.speaker && data.content) {
          speakerName = data.speaker;
          languageTag = data.language;
          actualText = data.content;
          ws.currentSpeaker = speakerName;
          ws.currentLanguageTag = languageTag || 'zh';
        }
      }
    } catch (e) {
      // 非JSON格式，直接使用原文本
    }

    // 检查是否需要绑定设备
    if (ws.needBind) {
      await this._checkBindDevice(ws);
      return;
    }

    // 检查输出限制
    if (ws.maxOutputSize > 0) {
      // TODO: 实现输出限制检查
    }

    // 如果正在播放，打斷（非手动模式）
    if (ws.clientIsSpeaking && ws.clientListenMode !== 'manual') {
      await this._handleAbort(ws);
    }

    // 进行意图分析（如果配置了意图服务）
    const intentHandled = await this._handleIntent(ws, actualText);
    if (intentHandled) {
      return;
    }

    // 处理完整的聊天消息
    await this.handleCompleteChatMessage(ws, actualText);
  }

  /**
   * 处理意图
   */
  async _handleIntent(ws, text) {
    // TODO: 实现意图分析
    return false;
  }

  /**
   * 检查设备绑定
   */
  async _checkBindDevice(ws) {
    if (ws.bindCode) {
      const text = `请登录控制面板，输入${ws.bindCode}，绑定设备。`;
      this.sendMessage(ws, {
        type: 'stt',
        session_id: ws.sessionId,
        text: text,
        timestamp: new Date().toISOString()
      });
      // TODO: 播放提示音
    } else {
      const text = '没有找到该设备的版本信息，请正确配置OTA地址，然后重新编译固件。';
      this.sendMessage(ws, {
        type: 'stt',
        session_id: ws.sessionId,
        text: text,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 检测语音活动（VAD）
   * 参照 Python silero.py 实现
   * @param {WebSocket} ws - WebSocket连接
   * @param {Buffer} opusPacket - Opus音频数据包
   * @returns {boolean} 是否有语音
   */
  async _detectVoice(ws, opusPacket) {
    // 手动模式：直接返回True，不进行实时VAD检测，所有音频都缓存
    if (ws.clientListenMode === 'manual') {
      return true;
    }

    // 如果有VAD服务且已启用，使用VAD服务
    if (this.vadService && this.vadService.isEnabled()) {
      return this.vadService.detect(opusPacket);
    }

    // 初始化连接级别的VAD状态（参照Python conn对象）
    if (!ws.vadState) {
      ws.vadState = {
        audioBuffer: Buffer.alloc(0),      // client_audio_buffer: PCM音频缓冲区
        voiceWindow: [],                    // client_voice_window: 滑动窗口
        haveVoice: false,                   // client_have_voice: 当前是否有语音
        lastIsVoice: false,                 // last_is_voice: 上一帧是否有语音
        lastActivityTime: Date.now(),       // last_activity_time: 最后活动时间
        voiceStop: false                    // client_voice_stop: 语音是否停止
      };
    }

    const state = ws.vadState;

    try {
      // Opus解码为PCM（参照Python: pcm_frame = self.decoder.decode(opus_packet, 960)）
      let pcmFrame = null;
      if (this.sttService && this.sttService.decoder) {
        try {
          // 解码Opus包为PCM（16000Hz, 60ms帧）
          pcmFrame = this.sttService.decoder.decode(opusPacket, 960);
        } catch (e) {
          logger.debug(`Opus解码失败: ${e.message}`);
          return false;
        }
      } else {
        // 如果没有Opus解码器，使用原始数据作为近似
        pcmFrame = opusPacket;
      }

      if (!pcmFrame || pcmFrame.length === 0) {
        return false;
      }

      // 将新数据加入缓冲区（参照Python: conn.client_audio_buffer.extend(pcm_frame)）
      state.audioBuffer = Buffer.concat([state.audioBuffer, pcmFrame]);

      // VAD配置参数（参照Python silero.py）
      const VAD_THRESHOLD = this.config.vad?.threshold || 0.001;           // 高阈值
      const VAD_THRESHOLD_LOW = this.config.vad?.thresholdLow || 0.0008;    // 低阈值
      const SILENCE_THRESHOLD_MS = this.config.vad?.silenceThresholdMs || 1000;  // 静默阈值
      const FRAME_WINDOW_THRESHOLD = 3;                                  // 至少3帧才算有语音
      const SAMPLES_PER_FRAME = 512;                                     // 每帧512采样点
      const BYTES_PER_SAMPLE = 2;                                        // 16bit = 2 bytes

      let clientHaveVoice = false;

      // 处理缓冲区中的完整帧（每次处理512采样点）
      while (state.audioBuffer.length >= SAMPLES_PER_FRAME * BYTES_PER_SAMPLE) {
        // 提取前512个采样点（1024字节）
        const chunk = state.audioBuffer.slice(0, SAMPLES_PER_FRAME * BYTES_PER_SAMPLE);
        state.audioBuffer = state.audioBuffer.slice(SAMPLES_PER_FRAME * BYTES_PER_SAMPLE);

        // 计算音频能量（简单能量检测替代Silero模型）
        // 参照Python: audio_int16 = np.frombuffer(chunk, dtype=np.int16)
        const audioInt16 = new Int16Array(chunk.buffer, chunk.byteOffset, SAMPLES_PER_FRAME);

        // 计算RMS能量并归一化到0-1范围（类似Python: audio_float32 = audio_int16.astype(np.float32) / 32768.0）
        let sumSquares = 0;
        for (let i = 0; i < audioInt16.length; i++) {
          const sample = audioInt16[i] / 32768.0;
          sumSquares += sample * sample;
        }
        const rmsEnergy = Math.sqrt(sumSquares / audioInt16.length);

        // 双阈值判断（参照Python silero.py 第71-77行）
        let isVoice;
        if (rmsEnergy >= VAD_THRESHOLD) {
          isVoice = true;
        } else if (rmsEnergy <= VAD_THRESHOLD_LOW) {
          isVoice = false;
        } else {
          // 在中间区域，延续前一个状态
          isVoice = state.lastIsVoice;
        }
        // 声音没低于最低值则延续前一个状态（参照Python第80行）
        state.lastIsVoice = isVoice;

        // 更新滑动窗口（参照Python: conn.client_voice_window.append(is_voice)）
        state.voiceWindow.push(isVoice);
        // 保持窗口大小（最多10帧）
        if (state.voiceWindow.length > 10) {
          state.voiceWindow.shift();
        }

        // 判断是否有语音（窗口内超过阈值数量的帧有声音）
        const trueCount = state.voiceWindow.filter(v => v).length;
        clientHaveVoice = trueCount >= FRAME_WINDOW_THRESHOLD;

        // 如果之前有声音，但本次没有声音，且与上次有声音的时间差已经超过了静默阈值
        // 则认为已经说完一句话（参照Python第88-92行）
        if (state.haveVoice && !clientHaveVoice) {
          const stopDuration = Date.now() - state.lastActivityTime;
          if (stopDuration >= SILENCE_THRESHOLD_MS) {
            state.voiceStop = true;
            logger.debug(`检测到语音停止，静默时间: ${stopDuration}ms`);
          }
        }

        // 如果有语音，更新状态和时间戳（参照Python第93-95行）
        if (clientHaveVoice) {
          state.haveVoice = true;

          state.lastActivityTime = Date.now();
        }
      }
      return clientHaveVoice;
    } catch (error) {
      logger.error(`VAD处理错误: ${error.message}`);
      return false;
    }
  }

  /**
   * 处理打斷
   * @param {WebSocket} ws - WebSocket连接
   */
  async _handleAbort(ws) {
    logger.info(`处理打斷请求 [${ws.clientId}]`);

    // 发送打斷消息
    this.sendMessage(ws, {
      type: 'abort',
      session_id: ws.sessionId,
      reason: 'user_interrupt',
      timestamp: new Date().toISOString()
    });

    // 设置状态
    ws.clientIsSpeaking = false;
    ws.clientAbort = true;
  }

  /**
   * 检查空闲超时
   * @param {WebSocket} ws - WebSocket连接
   * @param {boolean} hasVoice - 是否有语音
   */
  async _checkIdleTimeout(ws, hasVoice) {
    const now = Date.now();

    if (hasVoice) {
      ws.lastActivityTime = now;
      return;
    }

    // 只有在已初始化时间戳的情况下才检查超时
    if (ws.lastActivityTime && ws.lastActivityTime > 0) {
      const noVoiceTime = now - ws.lastActivityTime;
      const timeout = (this.config.close_connection_no_voice_time || 120) * 1000;

      if (!ws.closeAfterChat && noVoiceTime > timeout) {
        logger.info(`长时间无语音，准备关闭连接 [${ws.clientId}]`);
        ws.closeAfterChat = true;
        ws.clientAbort = false;

        // 发送结束提示
        const endPrompt = this.config.end_prompt?.prompt ||
          '请你以```时间过得真快```为开头，用富有感情、依依不舍的话来结束这场对话吧。';

        await this._startToChat(ws, endPrompt);
      }
    }
  }

  /**
   * 分析音频振幅，判断是否有效音频
   * @param {Buffer} pcmData - PCM 音频数据 (16-bit signed)
   * @param {Object} thresholds - 阈值配置 { minMaxAmplitude, minAvgAmplitude }
   * @returns {Object} 振幅统计信息 { maxAmplitude, avgAmplitude, isValid }
   */
  _analyzeAudioAmplitude(pcmData, thresholds = {}) {
    // 使用传入的阈值或默认值
    const MIN_MAX_AMPLITUDE = thresholds.minMaxAmplitude || 500;
    const MIN_AVG_AMPLITUDE = thresholds.minAvgAmplitude || 50;

    const samples = Math.floor(pcmData.length / 2); // 16-bit = 2 bytes per sample

    if (samples === 0) {
      return { maxAmplitude: 0, avgAmplitude: 0, isValid: false };
    }

    let maxAmplitude = 0;
    let sumAmplitude = 0;

    // 采样分析（每隔一定间隔采样，提高效率）
    const sampleStep = Math.max(1, Math.floor(samples / 1000));
    let sampledCount = 0;

    for (let i = 0; i < samples; i += sampleStep) {
      const amplitude = Math.abs(pcmData.readInt16LE(i * 2));
      maxAmplitude = Math.max(maxAmplitude, amplitude);
      sumAmplitude += amplitude;
      sampledCount++;
    }

    const avgAmplitude = sampledCount > 0 ? sumAmplitude / sampledCount : 0;

    // 判断是否有效：最大振幅或平均振幅超过阈值
    const isValid = maxAmplitude >= MIN_MAX_AMPLITUDE || avgAmplitude >= MIN_AVG_AMPLITUDE;

    return { maxAmplitude, avgAmplitude, isValid };
  }

  /**
   * 创建 WAV 文件缓冲区
   * @param {Buffer} pcmData - PCM 音频数据
   * @param {number} sampleRate - 采样率
   * @param {number} channels - 声道数
   * @param {number} bitsPerSample - 位深度
   * @returns {Buffer} WAV 文件缓冲区
   */
  _createWavBuffer(pcmData, sampleRate, channels, bitsPerSample) {
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const fileSize = 44 + dataSize;

    const buffer = Buffer.alloc(fileSize);
    let offset = 0;

    // RIFF header
    buffer.write('RIFF', offset); offset += 4;
    buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
    buffer.write('WAVE', offset); offset += 4;

    // fmt chunk
    buffer.write('fmt ', offset); offset += 4;
    buffer.writeUInt32LE(16, offset); offset += 4; // chunk size
    buffer.writeUInt16LE(1, offset); offset += 2;  // audio format (PCM)
    buffer.writeUInt16LE(channels, offset); offset += 2;
    buffer.writeUInt32LE(sampleRate, offset); offset += 4;
    buffer.writeUInt32LE(byteRate, offset); offset += 4;
    buffer.writeUInt16LE(blockAlign, offset); offset += 2;
    buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

    // data chunk
    buffer.write('data', offset); offset += 4;
    buffer.writeUInt32LE(dataSize, offset); offset += 4;
    pcmData.copy(buffer, offset);

    return buffer;
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