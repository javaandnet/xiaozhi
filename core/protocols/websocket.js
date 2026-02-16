import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';

class WebSocketProtocol {
  constructor(options = {}) {
    this.wss = options.wss;
    this.heartbeatInterval = null;
    this.config = options.config || {};
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

    // 发送连接确认
    this.sendToClient(ws, {
      type: 'connection_ack',
      clientId: clientId,
      timestamp: new Date().toISOString()
    });

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

  handleMessage(ws, data) {
    // 基础消息处理逻辑
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      // 如果不是JSON，可能是二进制音频数据
      this.handleBinaryData(ws, data);
      return;
    }

    const { type, session_id, ...payload } = message;

    // 更新会话ID
    if (session_id) {
      ws.sessionId = session_id;
    }

    logger.debug(`处理消息类型: ${type}`);

    // 根据消息类型处理
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
      case 'start_recognition':
        logger.info(`处理开始识别请求 [${ws.clientId}]`);
        this.sendToClient(ws, {
          type: 'recognition_started',
          sessionId: ws.sessionId,
          message: '语音识别已启动，可以说话了'
        });
        break;
      case 'audio_data':
        logger.info(`处理音频数据 [${ws.clientId}]: ${payload.audioData?.length || 0} bytes`);
        // 这里应该调用STT服务处理音频
        this.sendToClient(ws, {
          type: 'recognition_result',
          result: {
            text: '模拟识别结果',
            confidence: 0.9,
            isWakeWord: false
          },
          sessionId: ws.sessionId
        });
        break;
      case 'wake_word_detected':
        logger.info(`处理唤醒词检测通知 [${ws.clientId}]: ${payload.keyword}`);
        this.sendToClient(ws, {
          type: 'wake_word_acknowledged',
          keyword: payload.keyword,
          confidence: payload.confidence,
          timestamp: payload.timestamp,
          message: '已检测到唤醒词，请说话'
        });
        break;
      default:
        logger.warn(`未知消息类型: ${type}`);
        this.sendError(ws, `未知消息类型: ${type}`, session_id);
    }
  }

  handleHello(ws, payload) {
    const { version, transport, audio_params } = payload;

    if (version !== 1 || transport !== 'websocket') {
      this.sendError(ws, '不支持的协议版本或传输方式', ws.sessionId);
      return;
    }

    ws.audioParams = audio_params;
    ws.isAuthenticated = true;

    this.sendToClient(ws, {
      type: 'hello',
      transport: 'websocket',
      audio_params: {
        format: 'opus',
        sampleRate: 16000,
        channels: 1,
        frameDuration: 60
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

    logger.info(`监听状态更新 [${ws.clientId}]: ${state}`);
  }

  handleAbort(ws, payload) {
    const { reason } = payload;
    logger.info(`会话终止 [${ws.sessionId}]: ${reason || '未知原因'} (${ws.clientId})`);
  }

  handleIot(ws, payload) {
    const { descriptors, states } = payload;
    logger.info(`收到IoT消息 [${ws.clientId}]: descriptors=${!!descriptors}, states=${!!states}`);
  }

  handleChat(ws, payload) {
    const { text, state } = payload;
    if (state === 'complete' && text) {
      logger.info(`收到聊天消息 [${ws.clientId}]: ${text}`);
    }
  }

  handleBinaryData(ws, data) {
    logger.debug(`收到二进制数据: ${data.length} bytes (${ws.clientId})`);
  }

  handleDisconnect(ws) {
    if (ws.sessionId) {
      logger.info(`会话结束: ${ws.sessionId} (${ws.clientId})`);
    }
  }

  sendToClient(ws, message) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

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

  broadcast(message, excludeClientId = null) {
    this.wss.clients.forEach((client) => {
      if (client.clientId !== excludeClientId && client.readyState === 1) {
        this.sendToClient(client, message);
      }
    });
  }

  startHeartbeat(interval = 30000) {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          logger.warn(`心跳超时，断开连接: ${ws.clientId}`);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, interval);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export default WebSocketProtocol;