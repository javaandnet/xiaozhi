import WebSocket from 'ws';

console.log('开始WebSocket Hello超时测试...');

// 使用环境变量中的端口，如果没有则使用默认端口
const PORT = process.env.PORT || 9999;
const ws = new WebSocket(`ws://localhost:${PORT}`);

let connectionTimeout;
let helloTimeout;

ws.on('open', function open() {
    console.log('✅ WebSocket连接成功');

    // 清除连接超时
    clearTimeout(connectionTimeout);

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
        },
        device_id: 'test_device_001',
        device_name: 'Test Device',
        device_mac: 'AA:BB:CC:DD:EE:FF'
    };

    console.log('📤 发送Hello消息:', JSON.stringify(helloMessage, null, 2));
    ws.send(JSON.stringify(helloMessage));

    // 设置hello响应超时（10秒）
    helloTimeout = setTimeout(() => {
        console.log('⏰ Hello响应超时！');
        ws.close();
    }, 10000);
});

ws.on('message', function incoming(data) {
    try {
        const message = JSON.parse(data.toString());
        console.log('📥 收到消息:', message);

        if (message.type === 'hello') {
            console.log('✅ 收到Hello响应');
            clearTimeout(helloTimeout);

            // 显示session_id和其他重要信息
            if (message.session_id) {
                console.log('📋 Session ID:', message.session_id);
            }
            if (message.transport) {
                console.log('🚗 Transport:', message.transport);
            }
            if (message.audio_params) {
                console.log('🔊 Audio Params:', message.audio_params);
            }

            // 测试完成，关闭连接
            setTimeout(() => {
                console.log('🔒 测试完成，关闭连接');
                ws.close();
            }, 1000);
        }
    } catch (error) {
        console.log('📥 收到二进制数据:', data.length, 'bytes');
    }
});

ws.on('error', function error(err) {
    console.log('❌ WebSocket错误:', err.message);
    clearTimeout(connectionTimeout);
    clearTimeout(helloTimeout);
});

ws.on('close', function close(code, reason) {
    console.log('✅ WebSocket连接已关闭');
    console.log('Code:', code, 'Reason:', reason?.toString() || '无');
    clearTimeout(connectionTimeout);
    clearTimeout(helloTimeout);
});

// 连接超时处理（5秒内必须建立连接）
connectionTimeout = setTimeout(() => {
    console.log('⏰ 连接超时，无法建立WebSocket连接');
    if (ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
    }
}, 5000);

console.log(`📡 尝试连接到 ws://localhost:${PORT}`);