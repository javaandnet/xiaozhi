const WebSocketProtocol = require('../../core/protocols/websocket');

class WebSocketHandler extends WebSocketProtocol {
  constructor(options) {
    super(options);
    this.deviceManager = options.deviceManager;
    this.sessionManager = options.sessionManager;
    this.audioManager = options.audioManager;
    this.ttsService = options.ttsService;
    this.sttService = options.sttService;
    this.llmService = options.llmService; // 使用传入的LLM服务
  }

  handleConnection(ws, req) {
    // 先调用父类方法进行基础连接处理
    super.handleConnection(ws, req);
    
    // 不再添加额外的message监听器，因为父类已经处理了消息分发
    // 业务逻辑处理已经在handleMessage中通过switch-case完成
  }

  handleMessage(ws, data) {
    // 直接处理所有消息类型，不依赖父类
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
        // 处理原始协议消息
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
        // 调用STT服务处理音频
        this.handleAudioData(ws, payload);
        break;
      case 'wake_word_detected':
        console.log(`处理唤醒词检测通知 [${ws.clientId}]: ${payload.keyword}`);
        this.handleWakeWordDetected(ws, payload);
        break;
      default:
        console.warn(`未知消息类型: ${type}`);
        this.sendError(ws, `未知消息类型: ${type}`);
    }
  }

  handleProtocolMessage(ws, type, payload) {
    // 处理原始ESP32协议消息
    switch (type) {
      case 'hello':
        const { version, transport, audio_params } = payload;
        if (version !== 1 || transport !== 'websocket') {
          this.sendError(ws, '不支持的协议版本或传输方式', ws.sessionId);
          return;
        }
        ws.audioParams = audio_params;
        ws.isAuthenticated = true;
        ws.sessionId = this.sessionManager.createSession(ws.clientId);
        
        this.sendMessage(ws, {
          type: 'hello',
          transport: 'websocket',
          session_id: ws.sessionId,
          audio_params: {
            format: 'opus',
            sampleRate: 16000,
            channels: 1,
            frameDuration: 60
          }
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
          this.sessionManager.endSession(ws.sessionId);
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
      this.sendMessage(ws, {
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
          llmResponse = await this.llmService.chat(connectionId, text);
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
        type: 'llm_response',
        session_id: sessionId,
        text: llmResponse,
        emotion: this.detectEmotion(llmResponse),
        timestamp: new Date().toISOString()
      });
      
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
          console.log(`TTS合成成功: ${ttsResult.length} bytes`);
          
          // 6. 发送TTS音频数据
          this.sendMessage(ws, {
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
      this.sendMessage(ws, {
        type: 'processing',
        session_id: sessionId,
        state: 'complete',
        timestamp: new Date().toISOString()
      });
      
      console.log(`聊天消息处理完成 [${connectionId}]`);
      
    } catch (error) {
      console.error(`处理聊天消息失败 [${connectionId}]:`, error);
      
      // 发送错误消息
      this.sendError(ws, `处理消息失败: ${error.message}`, sessionId);
      
      // 发送处理结束状态
      this.sendMessage(ws, {
        type: 'processing',
        session_id: sessionId,
        state: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
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