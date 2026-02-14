/**
 * 小智唤醒词检测演示客户端
 * 展示如何使用WebSocket与服务器进行交互
 */

const WebSocket = require('ws');

class XiaoZhiClient {
  constructor(url = 'ws://localhost:3000') {
    this.url = url;
    this.ws = null;
    this.sessionId = `session_${Date.now()}`;
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log('正在连接到小智服务器...');
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log('✓ 连接成功！');
        this.setupEventHandlers();
        resolve();
      });

      this.ws.on('error', (error) => {
        console.error('连接错误:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('连接已关闭');
      });
    });
  }

  setupEventHandlers() {
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleServerMessage(message);
      } catch (error) {
        console.error('解析服务器消息失败:', error);
      }
    });
  }

  handleServerMessage(message) {
    console.log('\n[服务器响应]', message.type);
    
    switch (message.type) {
      case 'recognition_result':
        console.log('  识别结果:', message.result.text);
        if (message.result.isWakeWord) {
          console.log('  🎉 检测到唤醒词:', message.result.keyword);
          console.log('  置信度:', message.result.confidence.toFixed(2));
        }
        break;
        
      case 'wake_word_acknowledged':
        console.log('  ✅ 唤醒词确认:', message.message);
        console.log('  关键词:', message.keyword);
        console.log('  置信度:', message.confidence.toFixed(2));
        break;
        
      case 'tts_response':
        console.log('  🔊 TTS响应:', message.text);
        if (message.wakeWordTriggered) {
          console.log('  🤖 唤醒词触发的响应');
        }
        break;
        
      case 'text_response':
        console.log('  💬 文本响应:', message.text);
        if (message.wakeWordTriggered) {
          console.log('  🤖 唤醒词触发的响应');
        }
        break;
        
      case 'recognition_started':
        console.log('  ▶️ 语音识别已启动:', message.message);
        break;
        
      case 'error':
        console.error('  ❌ 错误:', message.message);
        break;
        
      default:
        console.log('  未知消息类型:', message);
    }
    console.log('---');
  }

  sendMessage(type, payload = {}) {
    const message = {
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      ...payload
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log('[发送消息]', type, payload);
    } else {
      console.error('WebSocket连接未建立');
    }
  }

  // 模拟发送音频数据
  sendAudioData(text) {
    console.log(`\n🎙️ 模拟发送音频: "${text}"`);
    
    // 将文本转换为模拟的音频数据（base64编码）
    const audioBuffer = Buffer.from(text, 'utf8');
    const base64Audio = audioBuffer.toString('base64');
    
    this.sendMessage('audio_data', {
      audioData: base64Audio
    });
  }

  // 发送唤醒词检测通知
  sendWakeWordDetected(keyword, confidence = 0.8) {
    console.log(`\n📢 发送唤醒词检测通知: ${keyword}`);
    
    this.sendMessage('wake_word_detected', {
      keyword,
      confidence,
      timestamp: Date.now()
    });
  }

  // 开始语音识别
  startRecognition() {
    console.log('\n▶️ 请求开始语音识别');
    
    this.sendMessage('start_recognition');
  }

  // 演示完整的唤醒词交互流程
  async demonstrateWakeWordFlow() {
    console.log('\n=== 小智唤醒词交互演示 ===\n');
    
    try {
      // 1. 连接到服务器
      await this.connect();
      
      // 2. 开始语音识别
      this.startRecognition();
      
      // 等待一点时间让服务器准备
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 3. 发送包含唤醒词的音频
      console.log('\n--- 场景1: 检测唤醒词 ---');
      this.sendAudioData('你好小智，今天天气怎么样？');
      
      // 等待处理结果
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 4. 发送普通对话音频
      console.log('\n--- 场景2: 普通对话 ---');
      this.sendAudioData('我觉得今天很适合出去走走');
      
      // 等待处理结果
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 5. 直接发送唤醒词检测通知
      console.log('\n--- 场景3: 直接唤醒词通知 ---');
      this.sendWakeWordDetected('小智', 0.9);
      
      // 6. 测试另一个唤醒词
      console.log('\n--- 场景4: 测试不同唤醒词 ---');
      this.sendAudioData('Hey XiaoZhi, what time is it?');
      
      // 等待一段时间后关闭连接
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('\n=== 演示完成 ===');
      this.ws.close();
      
    } catch (error) {
      console.error('演示过程中出现错误:', error);
    }
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const client = new XiaoZhiClient('ws://localhost:3001');
  client.demonstrateWakeWordFlow().catch(console.error);
}

module.exports = XiaoZhiClient;