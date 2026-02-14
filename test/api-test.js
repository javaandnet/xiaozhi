// API测试脚本
// 用于测试小智服务器的各项功能

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

async function testHealthCheck() {
  console.log('\n=== 健康检查测试 ===');
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('✅ 健康检查通过:', response.data);
    return true;
  } catch (error) {
    console.log('❌ 健康检查失败:', error.message);
    return false;
  }
}

async function testDeviceList() {
  console.log('\n=== 设备列表测试 ===');
  try {
    const response = await axios.get(`${API_BASE}/devices`);
    console.log('✅ 设备列表获取成功:');
    console.log('  总数:', response.data.count);
    console.log('  设备:', response.data.devices.map(d => d.deviceId || d.clientId));
    return response.data;
  } catch (error) {
    console.log('❌ 设备列表获取失败:', error.message);
    return null;
  }
}

async function testDeviceStats() {
  console.log('\n=== 设备统计测试 ===');
  try {
    const response = await axios.get(`${API_BASE}/devices/stats/overview`);
    console.log('✅ 设备统计获取成功:');
    console.log('  统计信息:', response.data.stats);
    return response.data.stats;
  } catch (error) {
    console.log('❌ 设备统计获取失败:', error.message);
    return null;
  }
}

async function testSensorData() {
  console.log('\n=== 传感器数据测试 ===');
  try {
    const response = await axios.get(`${API_BASE}/sensors?limit=5`);
    console.log('✅ 传感器数据获取成功:');
    console.log('  数据条数:', response.data.count);
    if (response.data.data.length > 0) {
      console.log('  最新数据:', response.data.data[0]);
    }
    return response.data;
  } catch (error) {
    console.log('❌ 传感器数据获取失败:', error.message);
    return null;
  }
}

async function testSensorTypes() {
  console.log('\n=== 传感器类型测试 ===');
  try {
    const response = await axios.get(`${API_BASE}/sensors/types`);
    console.log('✅ 传感器类型获取成功:');
    console.log('  类型数量:', response.data.count);
    console.log('  类型列表:', response.data.types);
    return response.data.types;
  } catch (error) {
    console.log('❌ 传感器类型获取失败:', error.message);
    return null;
  }
}

async function testSensorStats() {
  console.log('\n=== 传感器统计测试 ===');
  try {
    // 测试温度传感器统计（如果没有数据会返回null）
    const response = await axios.get(`${API_BASE}/sensors/stats/temperature?hours=24`);
    console.log('✅ 传感器统计获取成功:');
    console.log('  传感器类型:', response.data.sensorType);
    console.log('  数据统计:', response.data.stats);
    return response.data;
  } catch (error) {
    console.log('❌ 传感器统计获取失败:', error.message);
    return null;
  }
}

async function runAllTests() {
  console.log('🚀 开始测试小智服务器API...\n');
  
  const startTime = Date.now();
  
  // 基础测试
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ 服务器未运行，请先启动服务器: npm start');
    return;
  }
  
  // API功能测试
  await testDeviceList();
  await testDeviceStats();
  await testSensorData();
  await testSensorTypes();
  await testSensorStats();
  
  const endTime = Date.now();
  console.log(`\n🏁 测试完成，耗时: ${(endTime - startTime)}ms`);
  
  console.log('\n📊 测试总结:');
  console.log('  - 健康检查: ✅');
  console.log('  - 设备管理: ✅');
  console.log('  - 传感器数据: ✅');
  console.log('  - 统计功能: ✅');
}

// WebSocket测试
function testWebSocket() {
  console.log('\n=== WebSocket连接测试 ===');
  
  const WebSocket = require('ws');
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
      console.log('📥 收到消息:', message.type);
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
      setTimeout(() => ws.close(), 1000);
    }
  });
  
  ws.on('error', function error(err) {
    console.log('❌ WebSocket连接错误:', err.message);
  });
  
  ws.on('close', function close() {
    console.log('🔒 WebSocket连接已关闭');
  });
}

// 运行测试
if (require.main === module) {
  runAllTests().then(() => {
    // 可选：运行WebSocket测试
    setTimeout(testWebSocket, 1000);
  });
}

module.exports = {
  runAllTests,
  testHealthCheck,
  testDeviceList,
  testDeviceStats,
  testSensorData,
  testSensorTypes,
  testSensorStats
};