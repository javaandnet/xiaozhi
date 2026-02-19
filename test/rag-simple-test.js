#!/usr/bin/env node

/**
 * RAG 简单测试 - 快速验证 Qdrant 连接
 */

import RagService from '../core/services/rag.js';
import 'dotenv/config';

async function simpleTest() {
    console.log('🧪 RAG 简单测试\n');

    const config = {
        services: {
            rag: {
                qdrant: {
                    url: process.env.QDRANT_URL || 'http://localhost:6333',
                    collection: 'simple_test'
                },
                embedding: {
                    provider: 'openai',
                    baseUrl: process.env.EMBEDDING_BASE_URL || '',
                    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
                    apiKey: process.env.OPENAI_API_KEY || '',
                    dimension: parseInt(process.env.EMBEDDING_DIMENSION) || 1536
                }
            }
        }
    };

    try {
        // 1. 初始化
        console.log('1️⃣  初始化 RAG 服务...');
        const rag = new RagService(config);
        await rag.initialize();
        console.log('   ✓ 初始化成功\n');

        // 2. 获取状态
        console.log('2️⃣  检查集合状态...');
        const stats = await rag.getStats();
        console.log(`   向量数: ${stats.vectorCount}, 状态: ${stats.status}\n`);

        // 3. 如果配置了 Embedding，测试添加和搜索
        if (config.services.rag.embedding.apiKey && config.services.rag.embedding.baseUrl) {
            console.log('3️⃣  测试添加文档...');
            await rag.addDocument('test-1', '这是测试文档内容', { type: 'test' });
            console.log('   ✓ 添加成功\n');

            console.log('4️⃣  测试搜索...');
            const results = await rag.search('测试文档');
            console.log(`   找到 ${results.length} 条结果\n`);

            // 清理
            await rag.deleteDocument('test-1');
        } else {
            console.log('3️⃣  跳过 Embedding 测试（未配置 EMBEDDING_BASE_URL 或 OPENAI_API_KEY）\n');
        }

        console.log('✅ 测试完成！');

    } catch (error) {
        console.log('❌ 测试失败:', error.message);
    }
}

simpleTest();
