import WebSocket from 'ws';

console.log('开始完整的WebSocket协议测试...');

const PORT = process.env.PORT || 9999;
const ws = new WebSocket(`ws://localhost:${PORT}`);

let connectionTimeout;
let testPhase = 0;
const testPhases = [
    '连接建立',
    'Hello握手',
    'Listen状态',
    'Chat消息',
    '测试完成'
];

function logPhase(phase, message) {
    console.log(`[${phase}] ${message}`);
}

ws.on('open', function open() {
    console.log('✅ WebSocket连接成功');
    clearTimeout(connectionTimeout);

    // Phase 1: Hello握手
    testPhase = 1;
    logPhase(testPhases[testPhase], '发送Hello消息');

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

    ws.send(JSON.stringify(helloMessage));
});

ws.on('message', function incoming(data) {
    try {
        const message = JSON.parse(data.toString());
        console.log('📥 收到消息:', message);

        switch (message.type) {
            case 'hello':
                if (testPhase === 1) {
                    logPhase(testPhases[testPhase], '✅ Hello握手成功');
                    if (message.session_id) {
                        console.log(`   📋 Session ID: ${message.session_id}`);
                    }

                    // Phase 2: Listen状态
                    testPhase = 2;
                    setTimeout(() => {
                        logPhase(testPhases[testPhase], '发送Listen消息');
                        const listenMessage = {
                            type: 'listen',
                            session_id: message.session_id,
                            state: 'start',
                            mode: 'auto'
                        };
                        ws.send(JSON.stringify(listenMessage));
                    }, 1000);
                }
                break;

            case 'listen':
                if (testPhase === 2) {
                    logPhase(testPhases[testPhase], '✅ Listen状态确认');

                    // Phase 3: Chat消息
                    testPhase = 3;
                    setTimeout(() => {
                        logPhase(testPhases[testPhase], '发送Chat消息');
                        const chatMessage = {
                            type: 'chat',
                            session_id: message.session_id,
                            text: '你好，小智！',
                            state: 'complete'
                        };
                        ws.send(JSON.stringify(chatMessage));
                    }, 1000);
                }
                break;

            case 'llm':
                if (testPhase === 3) {
                    logPhase(testPhases[testPhase], '✅ 收到LLM回复');
                    console.log(`   💬 回复内容: ${message.text}`);
                    if (message.emotion) {
                        console.log(`   😊 情感: ${message.emotion}`);
                    }

                    // 测试完成，关闭连接
                    setTimeout(() => {
                        logPhase('测试完成', '🔒 关闭WebSocket连接');
                        ws.close();
                    }, 2000);
                }
                break;

            case 'error':
                console.log('❌ 错误消息:', message.message);
                break;

            default:
                console.log(`📥 其他消息类型: ${message.type}`);
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