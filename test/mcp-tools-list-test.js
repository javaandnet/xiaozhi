#!/usr/bin/env node

/**
 * MCP工具列表获取功能测试
 * 验证tools/list请求格式和分页处理是否正确
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const WS_URL = 'ws://localhost:8000';  // 根据server.js配置，端口是8000
const TEST_TIMEOUT = 30000; // 30秒超时

console.log('🧪 MCP工具列表获取测试开始...\n');

// 测试步骤计数器
let step = 1;

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

        // 监听所有消息
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log(`📥 收到消息:`, JSON.stringify(message, null, 2));

                // 检查是否是MCP消息
                if (message.type === 'mcp' && message.payload) {
                    const payload = message.payload;

                    // 检查是否是我们发送的tools/list请求的响应
                    if (payload.id === 1001) {  // 我们使用的测试ID
                        if (payload.result) {
                            console.log('✅ 收到tools/list响应');

                            // 验证响应格式
                            if (payload.result.tools && Array.isArray(payload.result.tools)) {
                                console.log(`📊 工具数量: ${payload.result.tools.length}`);

                                // 显示前几个工具
                                payload.result.tools.slice(0, 3).forEach((tool, index) => {
                                    console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
                                });

                                if (payload.result.tools.length > 3) {
                                    console.log(`  ... 还有 ${payload.result.tools.length - 3} 个工具`);
                                }
                            }

                            // 检查分页
                            if (payload.result.nextCursor) {
                                console.log(`⏭️  发现分页cursor: ${payload.result.nextCursor}`);
                                console.log('💡 需要发送分页请求获取更多工具');
                            } else {
                                console.log('✅ 工具列表获取完成（无更多分页）');
                            }
                        } else if (payload.error) {
                            console.log('❌ 收到错误响应:');
                            console.log(`   Code: ${payload.error.code}`);
                            console.log(`   Message: ${payload.error.message}`);
                        }
                    }
                }
            } catch (error) {
                console.log('解析消息失败:', error.message);
                console.log('原始数据:', data.toString());
            }
        });

        await sleep(2000); // 等待连接稳定

        console.log(`${step++}. 📤 发送MCP tools/list请求...`);

        // 构造符合MCP协议的tools/list请求
        const mcpRequest = {
            session_id: "test_session_" + Date.now(),
            type: "mcp",
            payload: {
                jsonrpc: "2.0",
                id: 1001,  // 使用测试专用ID
                method: "tools/list",
                params: {
                    cursor: ""  // 首次请求使用空字符串
                }
            }
        };

        console.log('发送的请求:');
        console.log(JSON.stringify(mcpRequest, null, 2));

        ws.send(JSON.stringify(mcpRequest));

        console.log('\n⏳ 等待响应...');

        // 等待响应
        await new Promise((resolve) => {
            setTimeout(resolve, 10000); // 等待10秒
        });

        console.log('\n✅ 测试完成');

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
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
    console.log('='.repeat(50));
    console.log('MCP Tools/List 功能测试');
    console.log('='.repeat(50));
    console.log(`WebSocket服务器: ${WS_URL}`);
    console.log(`测试超时: ${TEST_TIMEOUT}ms`);
    console.log('');

    await runTest();

    console.log('\n' + '='.repeat(50));
    console.log('测试结束');
    console.log('='.repeat(50));
}

// 运行测试
main().catch(console.error);