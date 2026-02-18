#!/usr/bin/env node

/**
 * MCP初始化会话执行验证测试
 * 验证当设备发送支持MCP的hello消息后，后台是否正确发送initialize请求
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const WS_URL = 'ws://localhost:8003';  // 服务器实际运行在8003端口
const TEST_TIMEOUT = 30000; // 30秒超时

console.log('🧪 MCP初始化会话执行验证测试\n');

let step = 1;
let receivedMessages = [];

/**
 * 等待指定时间
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 运行测试
 */
async function runTest() {
    let ws;

    try {
        console.log(`${step++}. 🔗 连接到WebSocket服务器...`);
        ws = new WebSocket(WS_URL);

        // 等待连接建立
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('连接超时'));
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                console.log('✅ WebSocket连接已建立\n');
                resolve();
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });

        // 监听所有消息并记录
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                receivedMessages.push(message);
                console.log(`📥 收到消息 [${receivedMessages.length}]:`, message.type || 'unknown');

                // 详细显示MCP相关消息
                if (message.type === 'mcp') {
                    console.log('   🔧 MCP消息详情:');
                    console.log('      Method:', message.payload?.method);
                    console.log('      ID:', message.payload?.id);
                    if (message.payload?.params) {
                        console.log('      Params:', JSON.stringify(message.payload.params, null, 2));
                    }
                } else if (message.type === 'hello') {
                    console.log('   🤝 Hello响应详情:');
                    console.log('      Session ID:', message.session_id);
                    console.log('      Transport:', message.transport);
                }

            } catch (error) {
                console.log('解析消息失败:', error.message);
            }
        });

        await sleep(2000); // 等待连接稳定

        console.log(`${step++}. 📤 发送支持MCP的Hello消息...`);

        // 构造支持MCP的hello消息
        const helloMessage = {
            type: 'hello',
            version: 1,
            transport: 'websocket',
            device_id: 'mcp-test-device-001',
            device_name: 'MCP Test Device',
            features: {
                mcp: true  // ✅ 声明支持MCP
            },
            audio_params: {
                format: 'opus',
                sample_rate: 16000,
                channels: 1,
                frame_duration: 60
            }
        };

        console.log('发送的Hello消息:');
        console.log(JSON.stringify(helloMessage, null, 2));

        ws.send(JSON.stringify(helloMessage));

        console.log('\n⏳ 等待响应和MCP初始化...');

        // 等待足够时间让初始化流程完成
        await new Promise((resolve) => {
            setTimeout(resolve, 5000); // 等待5秒
        });

        console.log('\n📊 测试结果分析:');

        // 分析收到的消息
        const helloResponses = receivedMessages.filter(msg => msg.type === 'hello');
        const mcpMessages = receivedMessages.filter(msg => msg.type === 'mcp');
        const initRequests = mcpMessages.filter(msg =>
            msg.payload?.method === 'initialize' && msg.payload?.id === 1
        );

        console.log(`\n📈 统计信息:`);
        console.log(`   总消息数: ${receivedMessages.length}`);
        console.log(`   Hello响应: ${helloResponses.length} 个`);
        console.log(`   MCP消息: ${mcpMessages.length} 个`);
        console.log(`   Initialize请求: ${initRequests.length} 个`);

        // 验证结果
        let success = true;
        let issues = [];

        console.log('\n✅ 验证结果:');

        // 检查是否收到hello响应
        if (helloResponses.length > 0) {
            console.log('✅ 收到Hello响应');
        } else {
            console.log('❌ 未收到Hello响应');
            success = false;
            issues.push('未收到Hello响应');
        }

        // 检查是否发送了initialize请求
        if (initRequests.length > 0) {
            console.log('✅ 后台正确发送了MCP initialize请求');

            // 验证initialize请求的格式
            const initRequest = initRequests[0];
            const payload = initRequest.payload;

            console.log('   请求格式验证:');
            if (payload.jsonrpc === '2.0') {
                console.log('   ✅ JSON-RPC版本正确');
            } else {
                console.log('   ❌ JSON-RPC版本错误');
                success = false;
            }

            if (payload.method === 'initialize') {
                console.log('   ✅ 方法名正确');
            } else {
                console.log('   ❌ 方法名错误');
                success = false;
            }

            if (payload.id === 1) {
                console.log('   ✅ 请求ID正确');
            } else {
                console.log('   ❌ 请求ID错误');
                success = false;
            }

            if (payload.params) {
                console.log('   ✅ 包含params字段');
                if (payload.params.protocolVersion) {
                    console.log(`   ✅ 协议版本: ${payload.params.protocolVersion}`);
                }
                if (payload.params.capabilities) {
                    console.log('   ✅ 包含capabilities字段');
                }
                if (payload.params.clientInfo) {
                    console.log(`   ✅ 客户端信息: ${payload.params.clientInfo.name} v${payload.params.clientInfo.version}`);
                }
            } else {
                console.log('   ❌ 缺少params字段');
                success = false;
            }

        } else {
            console.log('❌ 后台未发送MCP initialize请求');
            success = false;
            issues.push('未发送MCP initialize请求');
        }

        // 显示所有收到的消息（便于调试）
        console.log('\n📋 所有收到的消息:');
        receivedMessages.forEach((msg, index) => {
            console.log(`   ${index + 1}. Type: ${msg.type || 'unknown'}`);
            if (msg.type === 'mcp') {
                console.log(`      Method: ${msg.payload?.method || 'N/A'}`);
                console.log(`      ID: ${msg.payload?.id || 'N/A'}`);
            }
        });

        return { success, issues };

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
        return { success: false, issues: [error.message] };
    } finally {
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('\n🔌 关闭WebSocket连接');
            ws.close();
        }
    }
}

/**
 * 主函数
 */
async function main() {
    console.log('='.repeat(60));
    console.log('MCP初始化会话执行验证测试');
    console.log('='.repeat(60));
    console.log(`WebSocket服务器: ${WS_URL}`);
    console.log(`测试超时: ${TEST_TIMEOUT}ms`);
    console.log('');
    console.log('测试目标:');
    console.log('- 验证设备发送支持MCP的hello消息后');
    console.log('- 后台API是否正确发送initialize请求');
    console.log('- initialize请求格式是否符合MCP协议规范');
    console.log('');

    const result = await runTest();

    console.log('\n' + '='.repeat(60));
    if (result.success) {
        console.log('🎉 测试通过！');
        console.log('\n📋 验证结果总结:');
        console.log('✅ 设备发送支持MCP的hello消息后');
        console.log('✅ 后台API正确发送了initialize请求');
        console.log('✅ initialize请求格式符合MCP协议规范');
        console.log('✅ MCP初始化会话流程正常执行');
    } else {
        console.log('❌ 测试失败');
        console.log('\n📋 发现的问题:');
        result.issues.forEach((issue, index) => {
            console.log(`   ${index + 1}. ${issue}`);
        });
    }
    console.log('='.repeat(60));
}

// 运行测试
main().catch(console.error);