#!/usr/bin/env node

/**
 * LLM配置测试 - 验证配置是否正确读取和使用
 */

import LLMService from '../core/services/llm.js';

async function testLLMConfiguration() {
    console.log('🔍 LLM配置测试\n');

    // 使用与服务器相同的配置结构
    const config = {
        services: {
            llm: {
                provider: 'glm',
                model: 'glm-4-flash',
                api_key: '60284c17c64043f290fab4b0ce20ec1c.2ocJCaVIXzpGbch3',
                base_url: 'https://open.bigmodel.cn/api/paas/v4',
                temperature: 0.7,
                max_tokens: 500
            }
        }
    };

    try {
        console.log('1. 创建LLM服务实例...');
        const llmService = new LLMService(config);

        console.log('2. 检查配置读取...');
        console.log('   Provider:', llmService.provider);
        console.log('   Model:', llmService.model);
        console.log('   API Key配置:', llmService.apiKey ? '✓ 已配置' : '✗ 未配置');
        console.log('   Base URL:', llmService.baseUrl);

        console.log('\n3. 检查服务配置状态...');
        console.log('   isConfigured():', llmService.isConfigured());

        console.log('\n4. 测试LLM调用...');
        const response = await llmService.chat('test_connection', '你好');
        console.log('   ✓ LLM调用成功!');
        console.log('   回复内容:', response.substring(0, 100) + '...');

    } catch (error) {
        console.log('   ❌ LLM测试失败:', error.message);
        console.log('   错误详情:', error);
    }
}

testLLMConfiguration().catch(console.error);