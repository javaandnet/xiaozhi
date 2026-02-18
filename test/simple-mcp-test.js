// 简化MCP功能验证测试
import { WebSocket } from 'ws';

console.log('🚀 简化MCP功能验证');

const ws = new WebSocket('ws://localhost:8003');

ws.on('open', () => {
    console.log('✅ 连接成功');
    
    // 发送支持MCP的hello消息
    ws.send(JSON.stringify({
        type: 'hello',
        version: 1,
        transport: 'websocket',
        device_id: 'mcp-test-device',
        device_name: 'MCP Test Device',
        features: { mcp: true },
        audio_params: {
            format: 'opus',
            sample_rate: 16000,
            channels: 1,
            frame_duration: 60
        }
    }));
});

ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📥 收到:', message.type);
    
    if (message.type === 'mcp') {
        console.log('🔧 MCP消息:', message.payload?.method);
        
        // 响应初始化请求
        if (message.payload?.method === 'initialize') {
            ws.send(JSON.stringify({
                type: 'mcp',
                payload: {
                    jsonrpc: '2.0',
                    id: message.payload.id,
                    result: {
                        serverInfo: {
                            name: 'TestMCPDevice',
                            version: '1.0.0'
                        }
                    }
                }
            }));
            console.log('📤 发送初始化响应');
        }
        
        // 响应工具列表请求
        if (message.payload?.method === 'tools/list') {
            ws.send(JSON.stringify({
                type: 'mcp',
                payload: {
                    jsonrpc: '2.0',
                    id: message.payload.id,
                    result: {
                        tools: [{
                            name: 'test_led_control',
                            description: '控制LED灯的开关',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    action: {
                                        type: 'string',
                                        description: '操作类型: on/off',
                                        enum: ['on', 'off']
                                    },
                                    led_id: {
                                        type: 'string',
                                        description: 'LED编号'
                                    }
                                },
                                required: ['action', 'led_id']
                            }
                        }]
                    }
                }
            }));
            console.log('📤 发送工具列表响应');
        }
    }
});

ws.on('close', () => {
    console.log('🔌 连接关闭');
});

// 20秒后自动结束
setTimeout(() => {
    console.log('⏰ 测试结束');
    ws.close();
}, 20000);