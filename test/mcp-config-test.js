import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';

dotenv.config();

// 测试MCP配置功能
async function testMcpConfig() {
    const clientId = uuidv4();
    const authKey = process.env.AUTH_KEY || 'xiaozhi-auth-secret-key';

    console.log('🚀 开始测试MCP配置功能...');
    console.log(`📱 客户端ID: ${clientId}`);
    console.log(`🔑 认证密钥: ${authKey}`);

    try {
        // 连接到WebSocket服务器
        const ws = new WebSocket(`ws://localhost:8000`, {
            headers: {
                'Authorization': `Bearer ${authKey}`,
                'device-id': clientId
            }
        });

        ws.on('open', () => {
            console.log('✅ WebSocket连接已建立');
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('📥 收到消息:', message);

                // 检查是否是MCP配置消息
                if (message.type === 'mcp_config') {
                    console.log('🎯 收到MCP配置消息!');
                    console.log('📋 MCP配置详情:', JSON.stringify(message.data, null, 2));

                    // 测试发送MCP工具调用请求
                    const toolCallMessage = {
                        type: 'mcp_tool_call',
                        tool: 'test_tool',
                        parameters: {
                            param1: 'value1',
                            param2: 'value2'
                        }
                    };

                    console.log('📤 发送工具调用请求:', toolCallMessage);
                    ws.send(JSON.stringify(toolCallMessage));
                }

                // 检查工具调用响应
                if (message.type === 'mcp_tool_response') {
                    console.log('🔧 收到工具调用响应:', message);
                }

            } catch (error) {
                console.error('❌ 解析消息失败:', error);
            }
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket错误:', error);
        });

        ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket连接关闭: ${code} - ${reason}`);
        });

        // 保持连接30秒用于测试
        setTimeout(() => {
            console.log('⏰ 测试结束，关闭连接');
            ws.close();
        }, 30000);

    } catch (error) {
        console.error('❌ 测试失败:', error);
    }
}

// 运行测试
testMcpConfig();