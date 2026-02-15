const WebSocket = require('ws');

class TestClient {
  constructor(url = 'ws://localhost:8003') {
    this.url = url;
    this.ws = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log('正在连接到WebSocket服务器...');
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

      this.ws.on('close', (code, reason) => {
        console.log(`连接已关闭: ${code} - ${reason}`);
      });
    });
  }

  setupEventHandlers() {
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[服务器消息]:', message);
        
        // 根据消息类型处理
        switch (message.type) {
          case 'connection_ack':
            console.log('✓ 连接确认收到');
            this.testProtocol();
            break;
          case 'hello':
            console.log('✓ 握手完成');
            break;
          case 'chat':
            console.log('✓ 收到聊天回复:', message.text);
            break;
          case 'error':
            console.error('✗ 错误:', message.message);
            break;
        }
      } catch (error) {
        console.error('解析消息失败:', error);
      }
    });
  }

  sendMessage(type, payload = {}) {
    const message = {
      type,
      timestamp: Date.now(),
      ...payload
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log('[发送消息]:', type, payload);
    } else {
      console.error('WebSocket连接未建立');
    }
  }

  testProtocol() {
    console.log('\n--- 测试协议握手 ---');
    
    // 发送hello消息
    this.sendMessage('hello', {
      version: 1,
      transport: 'websocket',
      audio_params: {
        format: 'opus',
        sampleRate: 16000,
        channels: 1
      }
    });

    // 等待握手完成后再发送聊天消息
    setTimeout(() => {
      console.log('\n--- 测试聊天功能 ---');
      this.sendMessage('chat', {
        text: '你好，小智！',
        state: 'complete'
      });
    }, 1000);
  }

  async runTest() {
    try {
      await this.connect();
      
      // 保持连接3秒后关闭
      setTimeout(() => {
        console.log('\n测试完成，关闭连接');
        this.ws.close();
      }, 3000);
      
    } catch (error) {
      console.error('测试失败:', error);
    }
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const client = new TestClient();
  client.runTest();
}

module.exports = TestClient;