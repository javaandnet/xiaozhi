import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import routes from './routes/index.js';
import { settings, VERSION } from './config/index.js';
import { getLogger } from './core/logger.js';
import { voiceprintService } from './services/voiceprintService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = getLogger('app');

/**
 * 创建 Express 应用实例
 */
export async function createApp() {
    const app = express();

    // 添加 CORS 中间件
    app.use(cors({
        origin: '*',  // 生产环境中应该限制具体域名
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // 解析 JSON 请求体
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // 初始化声纹服务
    try {
        await voiceprintService.initialize();
        logger.initComponent('voiceprintService', '成功');
    } catch (error) {
        logger.initComponent('voiceprintService', '失败');
        // 继续启动，但声纹功能可能不可用
    }

    // 注册 API 路由
    app.use('/voiceprint', routes);

    // 根路径重定向到文档
    app.get('/', (req, res) => {
        res.redirect('/voiceprint/docs');
    });

    // /voiceprint/ 重定向到文档
    app.get('/voiceprint/', (req, res) => {
        res.redirect('/voiceprint/docs');
    });

    // API 文档路由（简化版，返回 OpenAPI JSON）
    app.get('/voiceprint/openapi.json', (req, res) => {
        res.json({
            openapi: '3.0.0',
            info: {
                title: '3D-Speaker 声纹识别API',
                description: '基于3D-Speaker的声纹注册与识别服务',
                version: VERSION,
            },
            servers: [
                {
                    url: `http://localhost:${settings.port}/voiceprint`,
                    description: '本地服务器',
                },
            ],
            paths: {
                '/health': {
                    get: {
                        summary: '健康检查',
                        parameters: [
                            {
                                name: 'key',
                                in: 'query',
                                required: true,
                                schema: { type: 'string' },
                                description: '访问密钥',
                            },
                        ],
                        responses: {
                            '200': {
                                description: '服务健康',
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                total_voiceprints: { type: 'integer' },
                                                status: { type: 'string' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                '/register': {
                    post: {
                        summary: '声纹注册',
                        security: [{ bearerAuth: [] }],
                        requestBody: {
                            content: {
                                'multipart/form-data': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            speaker_id: { type: 'string', description: '说话人ID' },
                                            file: { type: 'string', format: 'binary', description: 'WAV音频文件' },
                                        },
                                        required: ['speaker_id', 'file'],
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: '注册成功',
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                success: { type: 'boolean' },
                                                msg: { type: 'string' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                '/identify': {
                    post: {
                        summary: '声纹识别',
                        security: [{ bearerAuth: [] }],
                        requestBody: {
                            content: {
                                'multipart/form-data': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            speaker_ids: { type: 'string', description: '候选说话人ID，逗号分隔' },
                                            file: { type: 'string', format: 'binary', description: 'WAV音频文件' },
                                        },
                                        required: ['speaker_ids', 'file'],
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: '识别成功',
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                speaker_id: { type: 'string' },
                                                score: { type: 'number' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                '/{speaker_id}': {
                    delete: {
                        summary: '删除声纹',
                        security: [{ bearerAuth: [] }],
                        parameters: [
                            {
                                name: 'speaker_id',
                                in: 'path',
                                required: true,
                                schema: { type: 'string' },
                                description: '说话人ID',
                            },
                        ],
                        responses: {
                            '200': {
                                description: '删除成功',
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                success: { type: 'boolean' },
                                                msg: { type: 'string' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        description: '接口令牌',
                    },
                },
            },
        });
    });

    // 简单的 API 文档页面
    app.get('/voiceprint/docs', (req, res) => {
        res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>3D-Speaker 声纹识别API - 文档</title>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 30px; }
        .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .method { font-weight: bold; color: #2196F3; }
        .path { font-family: monospace; background: #e0e0e0; padding: 2px 6px; border-radius: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
        th { background: #f5f5f5; }
        code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>
    <h1>3D-Speaker 声纹识别API</h1>
    <p>基于3D-Speaker的声纹注册与识别服务 (v${VERSION})</p>
    
    <h2>接口列表</h2>
    
    <div class="endpoint">
        <span class="method">GET</span> <span class="path">/voiceprint/health</span>
        <p>健康检查接口，需要提供正确的密钥</p>
        <p>参数: <code>key</code> (query) - 访问密钥</p>
    </div>
    
    <div class="endpoint">
        <span class="method">POST</span> <span class="path">/voiceprint/register</span>
        <p>声纹注册接口</p>
        <p>Header: <code>Authorization: Bearer {token}</code></p>
        <p>Body (form-data):</p>
        <ul>
            <li><code>speaker_id</code> - 说话人ID</li>
            <li><code>file</code> - WAV音频文件</li>
        </ul>
    </div>
    
    <div class="endpoint">
        <span class="method">POST</span> <span class="path">/voiceprint/identify</span>
        <p>声纹识别接口</p>
        <p>Header: <code>Authorization: Bearer {token}</code></p>
        <p>Body (form-data):</p>
        <ul>
            <li><code>speaker_ids</code> - 候选说话人ID，逗号分隔</li>
            <li><code>file</code> - WAV音频文件</li>
        </ul>
    </div>
    
    <div class="endpoint">
        <span class="method">DELETE</span> <span class="path">/voiceprint/{speaker_id}</span>
        <p>删除声纹接口</p>
        <p>Header: <code>Authorization: Bearer {token}</code></p>
    </div>
    
    <h2>认证说明</h2>
    <p>除健康检查接口外，所有接口都需要在请求头中携带授权令牌：</p>
    <pre><code>Authorization: Bearer your-api-token</code></pre>
    
    <h2>OpenAPI 文档</h2>
    <p>JSON 格式: <a href="/voiceprint/openapi.json">/voiceprint/openapi.json</a></p>
</body>
</html>
        `);
    });

    // 404 处理
    app.use((req, res) => {
        res.status(404).json({ detail: '接口不存在' });
    });

    // 错误处理中间件
    app.use((err, req, res, next) => {
        logger.error(`请求错误: ${err.message}`);
        
        const statusCode = err.statusCode || 500;
        const message = err.message || '服务器内部错误';
        
        res.status(statusCode).json({ detail: message });
    });

    return app;
}
