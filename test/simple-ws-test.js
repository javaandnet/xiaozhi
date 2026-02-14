const WebSocket = require('ws');

console.log('🧪 简化版WebSocket协议测试');

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', function open() {
  console.log('✅ WebSocket连接成功');
  
  // 发送hello消息
  const helloMessage = {
    type: 'hello',
    version: 1,
    transport: 'websocket',
    audio_params: {
      format: 'opus',
      sample_rate: 16000,
      channels: 1,
      frame_duration: 60
    }
  };
  
  ws.send(JSON.stringify(helloMessage));
  console.log('📤 发送Hello消息');
});

ws.on('message', function incoming(data) {
  // 尝试解析为JSON，无论是Buffer还是字符串
  let message;
  try {
    message = JSON.parse(data.toString());
    console.log('📥 收到消息:', message);
  } catch (error) {
    console.log('📥 收到二进制数据:', data.length, 'bytes');
    return;
  }
  
  if (message.type === 'hello') {
    console.log('✅ 握手成功');
    
    // 发送IoT设备描述符
    const iotMessage = {
      type: 'iot',
      descriptors: {
        device_id: 'test_device_001',
        name: 'Test Device',
        capabilities: {
          sensors: 'temperature,humidity',
          actuators: 'led'
        }
      }
    };
    
    ws.send(JSON.stringify(iotMessage));
    console.log('📤 发送设备描述符');
    
    // 发送一些测试数据
    setTimeout(() => {
      const testData = {
        type: 'iot',
        states: {
          led: 'on',
          temperature: 25.6,
          humidity: 60.2
        }
      };
      ws.send(JSON.stringify(testData));
      console.log('📤 发送设备状态');
    }, 1000);
    
    // 5秒后关闭连接
    setTimeout(() => {
      console.log('🔒 关闭连接');
      ws.close();
    }, 5000);
  }
});

ws.on('error', function error(err) {
  console.log('❌ WebSocket错误:', err.message);
});

ws.on('close', function close() {
  console.log('✅ 测试完成');
});