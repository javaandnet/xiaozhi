const WebSocket = require('ws');

console.log('🚀 WebSocket连接测试');

// 测试服务器地址
const SERVER_URL = 'ws://localhost:8000';

// 创建WebSocket连接
const ws = new WebSocket(SERVER_URL);

ws.on('open', function open() {
    console.log('✅ 成功连接到服务器');
    
    // 发送Hello消息进行握手
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
    
    console.log('📤 发送Hello消息:', JSON.stringify(helloMessage, null, 2));
    ws.send(JSON.stringify(helloMessage));
});

ws.on('message', function incoming(data) {
    try {
        const message = JSON.parse(data.toString());
        console.log('📥 收到服务器响应:', JSON.stringify(message, null, 2));
        
        // 根据响应类型进行不同测试
        if (message.type === 'hello') {
            console.log('✅ 握手成功！');
            
            // 发送设备描述符
            setTimeout(() => {
                const descriptorMessage = {
                    type: 'iot',
                    descriptors: {
                        device_id: 'test_client_' + Date.now(),
                        name: 'Node.js测试客户端',
                        version: '1.0.0',
                        capabilities: {
                            sensors: ['temperature', 'humidity', 'pressure'],
                            actuators: ['led', 'relay']
                        }
                    }
                };
                console.log('📤 发送设备描述符:', JSON.stringify(descriptorMessage, null, 2));
                ws.send(JSON.stringify(descriptorMessage));
            }, 1000);
            
            // 发送设备状态数据
            setTimeout(() => {
                const stateMessage = {
                    type: 'iot',
                    states: {
                        temperature: (20 + Math.random() * 15).toFixed(1),
                        humidity: (40 + Math.random() * 40).toFixed(1),
                        pressure: (980 + Math.random() * 40).toFixed(1),
                        led: Math.random() > 0.5 ? 'on' : 'off',
                        battery: Math.floor(50 + Math.random() * 50)
                    }
                };
                console.log('📤 发送设备状态:', JSON.stringify(stateMessage, null, 2));
                ws.send(JSON.stringify(stateMessage));
            }, 2000);
            
            // 发送聊天消息
            setTimeout(() => {
                const chatMessage = {
                    type: 'chat',
                    text: '这是一条来自Node.js客户端的测试消息',
                    state: 'complete'
                };
                console.log('📤 发送聊天消息:', JSON.stringify(chatMessage, null, 2));
                ws.send(JSON.stringify(chatMessage));
            }, 3000);
            
            // 5秒后关闭连接
            setTimeout(() => {
                console.log('🔒 测试完成，关闭连接');
                ws.close();
            }, 5000);
        }
        
    } catch (error) {
        console.log('📥 收到二进制数据:', data.length, '字节');
    }
});

ws.on('error', function error(err) {
    console.log('❌ 连接错误:', err.message);
});

ws.on('close', function close() {
    console.log('✅ WebSocket连接已关闭');
    console.log('🎉 所有测试完成！');
});

// 连接超时处理
setTimeout(() => {
    if (ws.readyState === 0) {
        console.log('⏰ 连接超时');
        ws.close();
    }
}, 10000);