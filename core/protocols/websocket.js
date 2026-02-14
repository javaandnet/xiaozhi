const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../utils/logger');

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
      default:
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

module.exports = WebSocketProtocol;