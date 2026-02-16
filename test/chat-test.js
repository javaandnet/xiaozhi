import WebSocket from 'ws';

console.log('开始Chat消息测试...');

const PORT = process.env.PORT || 9999;
const ws = new WebSocket(`ws://localhost:${PORT}`);

let connectionTimeout;

ws.on('open', function open() {
    console.log('✅ WebSocket连接成功');
    clearTimeout(connectionTimeout);

    // 先发送hello消息建立会话
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

    console.log('📤 发送Hello消息');
    ws.send(JSON.stringify(helloMessage));
});

ws.on('message', function incoming(data) {
    try {
        const message = JSON.parse(data.toString());
        console.log('📥 收到消息:', message.type);

        if (message.type === 'hello') {
            console.log('✅ Hello握手成功，Session ID:', message.session_id);

            // 发送chat消息
            setTimeout(() => {
                const chatMessage = {
                    type: 'chat',
                    session_id: message.session_id,
                    text: '你好，小智！',
                    state: 'complete'
                };
                console.log('📤 发送Chat消息:', chatMessage.text);
                ws.send(JSON.stringify(chatMessage));
            }, 1000);
        }

        if (message.type === 'llm') {
            console.log('✅ 收到LLM回复');
            console.log('   💬 内容:', message.text);
            console.log('   😊 情感:', message.emotion);

            // 测试完成
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