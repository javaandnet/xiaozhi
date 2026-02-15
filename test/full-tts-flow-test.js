const WebSocket = require('ws');
const config = require('../config');

async function testFullTtsFlow() {
  console.log('开始测试完整的TTS流程...');
  
  try {
    // 连接到WebSocket服务器
    const ws = new WebSocket(`ws://localhost:9999`);
    
    let sessionId = null;
    
    ws.on('open', async function open() {
      console.log('✓ WebSocket连接成功');
      
      // 先发送hello消息建立会话
      const helloMessage = {
        type: 'hello',
        version: 1,
        transport: 'websocket',
        device_id: 'test-device-001',
        device_name: 'Test Device',
        device_mac: 'AA:BB:CC:DD:EE:FF'
      };
      
      console.log('发送hello消息');
      ws.send(JSON.stringify(helloMessage));
    });
    
    ws.on('message', function message(data) {
      try {
        const response = JSON.parse(data.toString());
        console.log('收到服务器响应:', response.type);
        
        if (response.type === 'hello' && response.session_id) {
          sessionId = response.session_id;
          console.log('✓ 收到会话ID:', sessionId);
          
          // 发送listen消息触发AI响应
          const listenMessage = {
            type: 'listen',
            session_id: sessionId,
            state: 'detect',
            text: '你好'
          };
          console.log('发送listen消息');
          ws.send(JSON.stringify(listenMessage));
          
        } else if (response.type === 'stt') {
          console.log('✓ STT识别结果:', response.text);
        } else if (response.type === 'llm') {
          console.log('✓ LLM回复:', response.text);
        } else if (response.type === 'tts' && response.state === 'start') {
          console.log('✓ TTS开始');
        } else if (response.type === 'tts' && response.state === 'sentence_start') {
          console.log('✓ 句子开始:', response.text);
        } else if (response.type === 'tts' && response.state === 'stop') {
          console.log('✓ TTS结束');
          ws.close();
        }
      } catch (error) {
        console.log('收到二进制音频数据');
      }
    });
    
    ws.on('close', function close() {
      console.log('✓ WebSocket连接关闭');
      console.log('\n🎉 完整TTS流程测试完成！');
      process.exit(0);
    });
    
    ws.on('error', function error(err) {
      console.error('❌ WebSocket错误:', err.message);
      process.exit(1);
    });
    
    // 设置超时
    setTimeout(() => {
      console.log('⚠️ 测试超时');
      ws.close();
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testFullTtsFlow();
}

module.exports = { testFullTtsFlow };