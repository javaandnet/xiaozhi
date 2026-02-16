import WebSocket from 'ws';

console.log('模拟真实设备连接测试...');

const PORT = process.env.PORT || 9999;
const ws = new WebSocket(`ws://localhost:${PORT}`);

let connectionTimeout;

// 模拟真实设备可能发送的消息格式
const testMessages = [
  // 测试1: 完整的标准消息
  {
    type: 'hello',
    version: 1,
    transport: 'websocket',
    audio_params: {
      format: 'opus',
      sample_rate: 16000,
      channels: 1,
      frame_duration: 60
    },
    device_id: 'DA:2B:68:28:5C:52',
    device_name: 'Web测试设备',
    device_mac: 'DA:2B:68:28:5C:52'
  },
  
  // 测试2: 缺少version字段
  {
    type: 'hello',
    transport: 'websocket',
    audio_params: {
      format: 'opus',
      sample_rate: 16000,
      channels: 1,
      frame_duration: 60
    },
    device_id: 'DA:2B:68:28:5C:52',
    device_name: 'Web测试设备',
    device_mac: 'DA:2B:68:28:5C:52'
  },
  
  // 测试3: version为其他值
  {
    type: 'hello',
    version: 2,
    transport: 'websocket',
    audio_params: {
      format: 'opus',
      sample_rate: 16000,
      channels: 1,
      frame_duration: 60
    },
    device_id: 'DA:2B:68:28:5C:52',
    device_name: 'Web测试设备',
    device_mac: 'DA:2B:68:28:5C:52'
  }
];

let currentTest = 0;

ws.on('open', function open() {
  console.log('✅ WebSocket连接成功');
  clearTimeout(connectionTimeout);
  
  sendNextTest();
});

function sendNextTest() {
  if (currentTest >= testMessages.length) {
    console.log('🏁 所有测试完成');
    ws.close();
    return;
  }
  
  const message = testMessages[currentTest];
  console.log(`\n🧪 测试 ${currentTest + 1}:`, JSON.stringify(message, null, 2));
  
  ws.send(JSON.stringify(message));
  currentTest++;
  
  // 2秒后发送下一个测试
  setTimeout(sendNextTest, 2000);
}

ws.on('message', function incoming(data) {
  try {
    const message = JSON.parse(data.toString());
    console.log('📥 服务器响应:', message);
    
    if (message.type === 'error') {
      console.log('❌ 错误:', message.message);
    } else if (message.type === 'hello') {
      console.log('✅ Hello握手成功');
      if (message.session_id) {
        console.log('📋 Session ID:', message.session_id);
      }
    }
  } catch (error) {
    console.log('📥 收到二进制数据:', data.length, 'bytes');
  }
});

ws.on('error', function error(err) {
  console.log('❌ WebSocket错误:', err.message);
  clearTimeout(connectionTimeout);
});

ws.on('close', function close(code, reason) {
  console.log('✅ WebSocket连接已关闭');
  console.log('Code:', code, 'Reason:', reason?.toString() || '无');
  clearTimeout(connectionTimeout);
});

// 连接超时处理
connectionTimeout = setTimeout(() => {
  console.log('⏰ 连接超时');
  if (ws.readyState === WebSocket.CONNECTING) {
    ws.terminate();
  }
}, 5000);

console.log(`📡 尝试连接到 ws://localhost:${PORT}`);