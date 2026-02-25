/**
 * SocketClient 测试文件
 * 用于测试 socket.js 的 ES Module 版本
 */

import CryptoJS from 'crypto-js';
import SocketClient from '../utils/socket.js';

// MD5 加密函数
function md5(text) {
    return CryptoJS.MD5(text).toString();
}

// 服务器配置
const CONFIG = {
    SERVER_URL: 'http://localhost:8379',
    USERNAME: 'fsr',
    PASSWORD: 'qqq111'  // 明文密码，会被自动 MD5 加密
};

/**
 * 基础连接测试
 */
async function testBasicConnection() {
    console.log('🚀 开始基础连接测试...\n');

    const client = new SocketClient(CONFIG.SERVER_URL, {
        username: CONFIG.USERNAME,
        password: CONFIG.PASSWORD
    });

    try {
        // 连接到服务器
        await client.connect();
        console.log('✅ 连接建立成功');

        // 设置回调
        client.setOnTaskComplete((data) => {
            console.log('🎯 收到任务完成通知:', data);
        });

        client.setOnTaskError((error) => {
            console.error('💥 任务执行错误:', error);
        });

        client.setOnTaskStatus((data) => {
            console.log('📊 任务状态更新:', data);
        });

        client.setOnRtnCategory((data) => {
            console.log('📋 返回分类:', data);
        });

        // 发送测试消息
        console.log('📤 发送测试消息...');
        client.sendChatMessage(
            '你好，这是一个测试消息',
            'test-quest-' + Date.now(),
            { isTest: true }
        );

        // 保持连接一段时间后断开
        setTimeout(() => {
            client.disconnect();
            console.log('👋 测试结束');
            process.exit(0);
        }, 15000);

    } catch (error) {
        console.error('🚨 测试失败:', error.message);
        process.exit(1);
    }
}

/**
 * 获取任务树测试
 */
async function testGetTaskTree() {
    console.log('🚀 开始获取任务树测试...\n');

    const client = new SocketClient(CONFIG.SERVER_URL, {
        username: CONFIG.USERNAME,
        password: CONFIG.PASSWORD
    });

    try {
        await client.connect();
        console.log('✅ 连接建立成功');

        // 延迟获取任务树
        setTimeout(async () => {
            try {
                const taskTree = await client.getTaskTree('test-quest-id');
                console.log('🌳 任务树:', JSON.stringify(taskTree, null, 2));
            } catch (error) {
                console.error('❌ 获取任务树失败:', error.message);
            }
        }, 3000);

        // 10秒后断开
        setTimeout(() => {
            client.disconnect();
            console.log('👋 测试结束');
            process.exit(0);
        }, 10000);

    } catch (error) {
        console.error('🚨 测试失败:', error.message);
        process.exit(1);
    }
}

/**
 * 批量消息测试
 */
async function testBatchMessages() {
    console.log('🚀 开始批量消息测试...\n');

    const client = new SocketClient(CONFIG.SERVER_URL, {
        username: CONFIG.USERNAME,
        password: CONFIG.PASSWORD
    });

    try {
        await client.connect();
        console.log('✅ 连接建立成功');

        const testMessages = [
            '创建用户统计报表',
            '分析销售数据趋势',
            '生成月度工作总结'
        ];

        // 发送多个消息
        testMessages.forEach((msg, index) => {
            setTimeout(() => {
                console.log(`📤 发送消息 ${index + 1}/${testMessages.length}: ${msg}`);
                client.sendChatMessage(
                    msg,
                    `batch-test-${index}-${Date.now()}`,
                    { isTest: true }
                );
            }, index * 2000);
        });

        // 监听响应
        let completedCount = 0;
        client.setOnTaskComplete((data) => {
            completedCount++;
            console.log(`✅ 完成 (${completedCount}/${testMessages.length}):`, data.questId || 'unknown');
        });

        // 30秒后结束
        setTimeout(() => {
            client.disconnect();
            console.log(`📊 批量测试完成，共处理 ${completedCount} 个任务`);
            process.exit(0);
        }, 30000);

    } catch (error) {
        console.error('🚨 测试失败:', error.message);
        process.exit(1);
    }
}

// 主函数
async function main() {
    const testType = process.argv[2] || 'basic';

    console.log('🤖 SocketClient 测试程序启动');
    console.log(`📍 服务器: ${CONFIG.SERVER_URL}`);
    console.log(`👤 用户名: ${CONFIG.USERNAME}`);
    console.log(`🧪 测试类型: ${testType}\n`);

    switch (testType) {
        case 'basic':
            await testBasicConnection();
            break;
        case 'tree':
            await testGetTaskTree();
            break;
        case 'batch':
            await testBatchMessages();
            break;
        default:
            console.log('❌ 未知测试类型。可用选项: basic, tree, batch');
            process.exit(1);
    }
}

main().catch(console.error);
