import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { logger } from '../utils/logger.js';
import DeviceManager from '../managers/deviceManager.js';

class WebSocketHandler {
  constructor(wss) {
    this.wss = wss;
    this.deviceManager = new DeviceManager();
    this.heartbeatInterval = null;
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
    const { version, transport, audio_params } = payload;
    
    // 验证必要字段
    if (version !== 1 || transport !== 'websocket') {
      this.sendError(ws, '不支持的协议版本或传输方式', ws.sessionId);
      return;
    }

    // 存储音频参数
    if (audio_params) {
      ws.audioParams = audio_params;
    }

    // 标记为已认证
    ws.isAuthenticated = true;

    // 发送服务器hello响应
    this.sendToClient(ws, {
      type: 'hello',
      transport: 'websocket',
      audio_params: {
        format: 'opus',
        sample_rate: 16000,
        channels: 1,
        frame_duration: 60
      }
    });

    logger.info(`设备握手成功: ${ws.clientId}`);
  }

  handleListen(ws, payload) {
    const { state, mode, text } = payload;
    
    if (!state) {
      this.sendError(ws, '缺少监听状态', ws.sessionId);
      return;
    }

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
        // 处理唤醒词检测
        break;
        
      default:
        this.sendError(ws, `未知监听状态: ${state}`, ws.sessionId);
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
    const { text, state } = payload;
    
    if (state === 'complete' && text) {
      logger.info(`收到完整聊天消息: ${text} (${ws.clientId})`);
      // 可以在这里处理聊天逻辑
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

// 创建全局WebSocket处理器实例
const handler = new WebSocketHandler();

const handleWebSocketConnection = (ws, req, wss) => {
  handler.wss = wss;
  handler.handleConnection(ws, req);
};

export { handleWebSocketConnection, handler as webSocketHandler };