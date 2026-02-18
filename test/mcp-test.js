import { WebSocket } from 'ws';

console.log('🚀 MCP功能测试');

// 测试服务器地址
const SERVER_URL = 'ws://localhost:8003';

// 创建WebSocket连接
const ws = new WebSocket(SERVER_URL);

ws.on('open', function open() {
    console.log('✅ 成功连接到服务器');
    
    // 发送Hello消息进行握手，包含MCP支持标识
    const helloMessage = {
        type: 'hello',
        version: 1,
        transport: 'websocket',
        device_id: 'test-device-001',
        device_name: 'Test Device',
        features: {
            mcp: true  // 标识设备支持MCP
        },
        audio_params: {
            format: 'opus',
            sample_rate: 16000,
            channels: 1,
            frame_duration: 60
        }
    };
    
    console.log('📤 发送Hello消息（支持MCP）:', JSON.stringify(helloMessage, null, 2));
    ws.send(JSON.stringify(helloMessage));
});

ws.on('message', function incoming(data) {
    try {
        const message = JSON.parse(data.toString());
        console.log('📥 收到服务器消息:', JSON.stringify(message, null, 2));
        
        // 处理不同类型的响应
        switch (message.type) {
            case 'hello':
                console.log('✅ 握手成功，会话ID:', message.session_id);
                console.log('📱 设备已声明支持MCP功能');
                console.log('⏳ 等待MCP初始化消息...');
                break;
                
            case 'mcp':
                console.log('🔧 收到MCP消息:');
                if (message.payload?.method === 'initialize') {
                    console.log('   -> MCP初始化请求');
                    // 发送初始化响应
                    const initResponse = {
                        type: 'mcp',
                        payload: {
                            jsonrpc: '2.0',
                            id: message.payload.id,
                            result: {
                                serverInfo: {
                                    name: 'TestDeviceMCP',
                                    version: '1.0.0'
                                }
                            }
                        }
                    };
                    console.log('📤 发送MCP初始化响应:', JSON.stringify(initResponse, null, 2));
                    ws.send(JSON.stringify(initResponse));
                } else if (message.payload?.method === 'tools/list') {
                    console.log('   -> MCP工具列表请求');
                    // 发送工具列表响应
                    const toolsResponse = {
                        type: 'mcp',
                        payload: {
                            jsonrpc: '2.0',
                            id: message.payload.id,
                            result: {
                                tools: [
                                    {
                                        name: 'turn_on_light',
                                        description: '打开指定的灯光',
                                        inputSchema: {
                                            type: 'object',
                                            properties: {
                                                light_id: {
                                                    type: 'string',
                                                    description: '灯光ID'
                                                }
                                            },
                                            required: ['light_id']
                                        }
                                    },
                                    {
                                        name: 'get_temperature',
                                        description: '获取当前温度',
                                        inputSchema: {
                                            type: 'object',
                                            properties: {
                                                sensor_id: {
                                                    type: 'string',
                                                    description: '传感器ID'
                                                }
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    };
                    console.log('📤 发送MCP工具列表响应:', JSON.stringify(toolsResponse, null, 2));
                    ws.send(JSON.stringify(toolsResponse));
                }
                break;
                
            default:
                console.log('📝 其他消息类型:', message.type);
        }
        
    } catch (error) {
        console.error('❌ 解析消息失败:', error.message);
        console.log('原始数据:', data.toString());
    }
});

ws.on('error', function error(error) {
    console.error('❌ WebSocket错误:', error);
});

ws.on('close', function close() {
    console.log('🔌 连接已关闭');
});

// 30秒后自动关闭测试
setTimeout(() => {
    console.log('⏰ 测试结束，关闭连接');
    ws.close();
}, 30000);