#!/usr/bin/env node

/**
 * RAG 服务测试 - 测试 Qdrant 向量数据库集成
 * 
 * 使用方法:
 *   1. 确保 Qdrant 已启动: docker-compose -f docker-compose.qdrant.yml up -d
 *   2. 配置 .env 中的 OPENAI_API_KEY
 *   3. 运行测试: node test/rag-test.js
 */

import RagService from '../core/services/rag.js';
import 'dotenv/config';

async function testRAGService() {
    console.log('🔍 RAG 服务测试\n');
    console.log('='.repeat(50));

    // 从环境变量读取配置
    const config = {
        services: {
            rag: {
                qdrant: {
                    url: process.env.QDRANT_URL || 'http://localhost:6333',
                    apiKey: process.env.QDRANT_API_KEY || '',
                    collection: process.env.QDRANT_COLLECTION || 'test_knowledge_base'
                },
                embedding: {
                    provider: process.env.EMBEDDING_PROVIDER || 'openai',
                    baseUrl: process.env.EMBEDDING_BASE_URL || '',
                    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
                    apiKey: process.env.OPENAI_API_KEY || '',
                    dimension: parseInt(process.env.EMBEDDING_DIMENSION) || 1536
                },
                search: {
                    limit: parseInt(process.env.RAG_SEARCH_LIMIT) || 5,
                    scoreThreshold: parseFloat(process.env.RAG_SCORE_THRESHOLD) || 0.5
                }
            }
        }
    };

    // 检查必要配置
    if (!config.services.rag.embedding.apiKey) {
        console.log('⚠️  OPENAI_API_KEY 未配置，部分测试将跳过');
        console.log('   请在 .env 文件中设置 OPENAI_API_KEY\n');
    }

    let ragService;

    try {
        // 测试 1: 初始化服务
        console.log('\n📋 测试 1: 初始化 RAG 服务');
        console.log('-'.repeat(40));
        ragService = new RagService(config);
        await ragService.initialize();
        console.log('   ✓ RAG 服务初始化成功');

        // 测试 2: 检查集合状态
        console.log('\n📋 测试 2: 检查集合状态');
        console.log('-'.repeat(40));
        const stats = await ragService.getStats();
        console.log('   集合名称:', ragService.collectionName);
        console.log('   向量数量:', stats.vectorCount);
        console.log('   状态:', stats.status);

        // 测试 3: 添加文档
        if (config.services.rag.embedding.apiKey) {
            console.log('\n📋 测试 3: 添加测试文档');
            console.log('-'.repeat(40));
            
            const testDocs = [
                {
                    id: 'test-doc-001',
                    content: '公司的报销制度规定，员工出差产生的交通费、住宿费可以在出差结束后7天内提交报销申请。报销需要提供正规发票和出差审批单。',
                    metadata: { category: '财务', type: '报销制度' }
                },
                {
                    id: 'test-doc-002',
                    content: '年假制度：入职满一年的员工可享受5天带薪年假，满三年可享受10天，满五年可享受15天。年假需提前一周申请。',
                    metadata: { category: '人事', type: '休假制度' }
                },
                {
                    id: 'test-doc-003',
                    content: '会议室预约流程：通过OA系统提交预约申请，注明会议时间、参会人数、会议室需求。审批通过后会收到确认邮件。',
                    metadata: { category: '行政', type: '会议室预约' }
                }
            ];

            for (const doc of testDocs) {
                await ragService.addDocument(doc.id, doc.content, doc.metadata);
                console.log(`   ✓ 文档已添加: ${doc.id}`);
            }

            // 测试 4: 批量添加
            console.log('\n📋 测试 4: 批量添加文档');
            console.log('-'.repeat(40));
            
            const batchDocs = [
                { id: 'batch-001', content: '工作时间：上午9:00-12:00，下午13:30-18:00。弹性工作制员工可在8:00-10:00之间打卡。', metadata: { category: '人事' } },
                { id: 'batch-002', content: '加班工资计算：工作日加班按1.5倍工资计算，周末加班按2倍计算，法定节假日按3倍计算。', metadata: { category: '人事' } }
            ];
            
            await ragService.addDocuments(batchDocs);
            console.log('   ✓ 批量添加完成');

            // 测试 5: 搜索功能
            console.log('\n📋 测试 5: 搜索功能测试');
            console.log('-'.repeat(40));

            const searchTests = [
                '出差报销需要什么材料',
                '年假怎么申请',
                '怎么预约会议室',
                '加班工资怎么算'
            ];

            for (const query of searchTests) {
                console.log(`\n   查询: "${query}"`);
                const results = await ragService.search(query);
                if (results.length > 0) {
                    console.log(`   找到 ${results.length} 条结果:`);
                    results.forEach((r, i) => {
                        console.log(`   ${i + 1}. [得分: ${r.score.toFixed(3)}] ${r.content.substring(0, 50)}...`);
                    });
                } else {
                    console.log('   未找到相关结果');
                }
            }

            // 测试 6: 删除文档
            console.log('\n\n📋 测试 6: 删除文档');
            console.log('-'.repeat(40));
            await ragService.deleteDocument('test-doc-003');
            console.log('   ✓ 文档已删除: test-doc-003');

            // 验证删除
            const afterDelete = await ragService.search('会议室预约');
            console.log(`   删除后搜索结果数: ${afterDelete.length}`);

            // 测试 7: 最终统计
            console.log('\n📋 测试 7: 最终统计');
            console.log('-'.repeat(40));
            const finalStats = await ragService.getStats();
            console.log('   最终向量数量:', finalStats.vectorCount);

            // 清理测试数据
            console.log('\n📋 清理测试数据');
            console.log('-'.repeat(40));
            await ragService.deleteDocument('test-doc-001');
            await ragService.deleteDocument('test-doc-002');
            await ragService.deleteDocument('batch-001');
            await ragService.deleteDocument('batch-002');
            console.log('   ✓ 测试数据已清理');

        } else {
            console.log('\n⚠️  跳过需要 Embedding 的测试（未配置 OPENAI_API_KEY）');
        }

        // 测试 8: 健康检查
        console.log('\n📋 测试 8: 健康检查');
        console.log('-'.repeat(40));
        const health = await ragService.healthCheck();
        console.log('   健康状态:', health.status);
        console.log('   消息:', health.message);

        console.log('\n' + '='.repeat(50));
        console.log('✅ 所有测试完成！\n');

    } catch (error) {
        console.log('\n❌ 测试失败:', error.message);
        console.log('\n可能的原因:');
        console.log('   1. Qdrant 未启动 - 运行: docker-compose -f docker-compose.qdrant.yml up -d');
        console.log('   2. OPENAI_API_KEY 未配置 - 在 .env 文件中设置');
        console.log('   3. 网络连接问题\n');
        
        if (process.env.DEBUG) {
            console.log('详细错误:', error);
        }
    }
}

// 运行测试
testRAGService().catch(console.error);

