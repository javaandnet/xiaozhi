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
    // 先调用父类方法进行基础连接处理
    super.handleConnection(ws, req);
    
    // 不再添加额外的message监听器，因为父类已经处理了消息分发
    // 业务逻辑处理已经在handleMessage中通过switch-case完成
  }

  handleMessage(ws, data) {
    // 重写消息处理逻辑，处理我们自己的业务消息
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

    // 根据消息类型处理
    switch (type) {
      case 'hello':
      case 'listen':
      case 'abort':
      case 'iot':
      case 'chat':
        // 调用父类处理原始协议消息
        super.handleMessage(data);
        break;
      case 'start_recognition':
        this.handleStartRecognition(ws, payload);
        break;
      case 'audio_data':
        this.handleAudioData(ws, payload);
        break;
      case 'wake_word_detected':
        this.handleWakeWordDetected(ws, payload);
        break;
      default:
        this.sendError(ws, `未知消息类型: ${type}`);
    }
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
}

module.exports = WebSocketHandler;