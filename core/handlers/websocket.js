const WebSocketProtocol = require('../../core/protocols/websocket');

class WebSocketHandler extends WebSocketProtocol {
  constructor(options) {
    super(options);
    this.deviceManager = options.deviceManager;
    this.sessionManager = options.sessionManager;
    this.audioManager = options.audioManager;
    this.ttsService = options.ttsService;
    this.sttService = options.sttService;
  }

  handleConnection(ws, req) {
    super.handleConnection(ws, req);
    
    // 处理特定的业务逻辑
    ws.on('message', async (data) => {
      try {
        await this.handleBusinessMessage(ws, data);
      } catch (error) {
        console.error('处理业务消息失败:', error);
        this.sendError(ws, '业务处理失败');
      }
    });
  }

  async handleBusinessMessage(ws, data) {
    // 这里处理具体的业务逻辑
    // 比如设备管理、会话控制、音频处理等
    console.log('处理业务消息:', data.toString());
  }
}

module.exports = WebSocketHandler;