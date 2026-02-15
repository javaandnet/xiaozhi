const WebSocket = require('ws');

console.log('开始WebSocket测试...');

const ws = new WebSocket('ws://localhost:8003');

ws.on('open', function open() {
  console.log('连接已建立');
  
  // 发送JSON消息
  const helloMsg = {
    type: 'hello',
    version: 1,
    transport: 'websocket',
    audio_params: {
      format: 'opus',
      sampleRate: 16000,
      channels: 1
    }
  };
  
  console.log('发送hello消息:', helloMsg);
  ws.send(JSON.stringify(helloMsg));
  
  // 发送聊天消息
  setTimeout(() => {
    const chatMsg = {
      type: 'chat',
      text: '你好，小智！',
      state: 'complete'
    };
    console.log('发送聊天消息:', chatMsg);
    ws.send(JSON.stringify(chatMsg));
  }, 1000);
  
  // 2秒后关闭连接
  setTimeout(() => {
    console.log('关闭连接');
    ws.close();
  }, 2000);
});

ws.on('message', function message(data) {
  console.log('收到消息:', data.toString());
});

ws.on('error', function error(err) {
  console.error('WebSocket错误:', err);
});

ws.on('close', function close() {
  console.log('连接已关闭');
});