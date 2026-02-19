#!/usr/bin/env node

/**
 * 简单 Embedding 服务示例
 * 
 * 功能：提供 OpenAI 兼容的 Embedding API
 * 用途：测试和演示，生产环境请替换为真实模型
 * 
 * 启动: node test/embedding-server.js
 * 默认端口: 8080
 */

import http from 'http';
import crypto from 'crypto';

const PORT = process.env.EMBEDDING_PORT || 8080;
const DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION) || 1536;

// 简单的文本向量生成（基于哈希的确定性向量）
// 注意：这只是演示用，实际应使用真实的 Embedding 模型
function generateEmbedding(text) {
    const vector = [];
    const hash = crypto.createHash('sha256').update(text).digest();
    
    for (let i = 0; i < DIMENSION; i++) {
        // 使用哈希值生成伪随机但确定性的向量
        const seed = hash[i % hash.length] + i;
        const value = Math.sin(seed) * 0.5 + Math.cos(seed * 0.7) * 0.5;
        vector.push(parseFloat(value.toFixed(6)));
    }
    
    // 归一化向量
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map(v => parseFloat((v / norm).toFixed(6)));
}

// 创建 HTTP 服务器
const server = http.createServer(async (req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // 健康检查
    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'embedding-server' }));
        return;
    }

    // Embedding API
    if (url.pathname === '/v1/embeddings' && req.method === 'POST') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const input = data.input || data.text;
                const model = data.model || 'simple-embedding';

                if (!input) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing input' }));
                    return;
                }

                // 支持批量输入
                const inputs = Array.isArray(input) ? input : [input];
                const embeddings = inputs.map((text, index) => ({
                    object: 'embedding',
                    index: index,
                    embedding: generateEmbedding(text)
                }));

                // OpenAI 兼容响应格式
                const response = {
                    object: 'list',
                    data: embeddings,
                    model: model,
                    usage: {
                        prompt_tokens: inputs.reduce((sum, t) => sum + t.length, 0),
                        total_tokens: inputs.reduce((sum, t) => sum + t.length, 0)
                    }
                };

                console.log(`[Embedding] 生成向量: "${inputs[0].substring(0, 30)}..." (${DIMENSION}维)`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));

            } catch (error) {
                console.error('[Error]', error.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    // 模型列表 API
    if (url.pathname === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            object: 'list',
            data: [{
                id: 'simple-embedding',
                object: 'model',
                owned_by: 'local'
            }]
        }));
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 Embedding 服务已启动');
    console.log('='.repeat(50));
    console.log(`   端口: ${PORT}`);
    console.log(`   向量维度: ${DIMENSION}`);
    console.log(`   API 地址: http://localhost:${PORT}/v1/embeddings`);
    console.log('');
    console.log('使用方法:');
    console.log('');
    console.log('  curl -X POST http://localhost:8080/v1/embeddings \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"input": "测试文本"}\'');
    console.log('');
    console.log('在 .env 中配置:');
    console.log(`  EMBEDDING_BASE_URL=http://localhost:${PORT}/v1`);
    console.log('  OPENAI_API_KEY=any-key');
    console.log('='.repeat(50));
});
