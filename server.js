import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import OTAHandler from './core/handlers/ota.js';
import { handleWebSocketConnection, initializeWebSocketHandler } from './core/handlers/websocket.js';
import DeviceManager from './core/managers/device.js';
import SessionManager from './core/managers/session.js';
import deviceRoutes from './routes/devices.js';
import sensorRoutes from './routes/sensors.js';
import { logger } from './utils/logger.js';

// 导入服务
import LLMService from './core/services/llm.js';
import McpService from './core/services/mcp.js';
import SttService from './core/services/stt.js';
import TTSService from './core/services/tts.js';
import VoiceprintService from './core/services/voiceprint.js';

const app = express();

// HTTPS配置
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', 'key.pem');
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', 'cert.pem');

// 创建HTTP或HTTPS服务器
let server;
if (USE_HTTPS) {
  try {
    const sslOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH)
    };
    server = https.createServer(sslOptions, app);
    console.log('🔒 HTTPS模式已启用');
  } catch (error) {
    console.error('❌ SSL证书加载失败，回退到HTTP模式:', error.message);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8000;
const PROTOCOL = USE_HTTPS ? 'https' : 'http';
const WS_PROTOCOL = USE_HTTPS ? 'wss' : 'ws';

// 直接使用配置文件中的值，环境变量作为覆盖
const config = {
  server: {
    port: PORT,
    http_port: PORT,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
    auth_key: process.env.AUTH_KEY || 'xiaozhi-auth-secret-key',
    use_https: USE_HTTPS
  },
  services: {
    llm: {
      provider: process.env.LLM_PROVIDER || 'glm',
      model: process.env.LLM_MODEL || 'glm-4-flash',
      api_key: process.env.LLM_API_KEY || '60284c17c64043f290fab4b0ce20ec1c.2ocJCaVIXzpGbch3',
      base_url: process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.7,
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS) || 500
    },
    tts: {
      provider: process.env.TTS_PROVIDER || 'edge',
      voice: process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural'
    },
    stt: {
      provider: process.env.STT_PROVIDER || 'doubao',
      language: process.env.STT_LANGUAGE || 'zh-CN',
      sampleRate: parseInt(process.env.STT_SAMPLE_RATE) || 16000,
      vadEnabled: process.env.STT_VAD_ENABLED !== 'false',
      vadThreshold: parseFloat(process.env.STT_VAD_THRESHOLD) || 0.5,
      enableWakeWordDetection: process.env.STT_WAKE_WORD_ENABLED === 'true',
      wakeWords: (process.env.STT_WAKE_WORDS || '小智,你好小智').split(','),
      // 豆包ASR配置
      doubao: {
        appid: process.env.DOUBAO_ASR_APPID,
        cluster: process.env.DOUBAO_ASR_CLUSTER,
        access_token: process.env.DOUBAO_ASR_ACCESS_TOKEN
      }
    },
    // MCP配置
    mcp: {
      endpoint: process.env.MCP_ENDPOINT || null,
      contextProviders: process.env.MCP_CONTEXT_PROVIDERS ?
        JSON.parse(process.env.MCP_CONTEXT_PROVIDERS) : null
    },
    // 声纹识别配置
    voiceprint: {
      url: process.env.VOICEPRINT_URL || '',
      speakers: process.env.VOICEPRINT_SPEAKERS ?
        process.env.VOICEPRINT_SPEAKERS.split('|') : [],
      similarity_threshold: parseFloat(process.env.VOICEPRINT_THRESHOLD) || 0.4
    }
  }
};

// 初始化服务
const llmService = new LLMService(config);
const ttsService = new TTSService(config);
const sttService = new SttService(config.services?.stt || {});
const mcpService = new McpService(config);
const voiceprintService = new VoiceprintService(config.services?.voiceprint || {});
const sessionManager = new SessionManager();
const deviceManager = new DeviceManager();

// 初始化MCP配置
let mcpConfig = {
  mcp_endpoint: config.services.mcp.endpoint,
  context_providers: config.services.mcp.contextProviders
};

// 初始化 WebSocketHandler（必须在路由加载之前）
initializeWebSocketHandler({
  deviceManager,
  sessionManager,
  llmService,
  ttsService,
  sttService,
  mcpService,
  voiceprintService,
  mcpConfig  // 传递MCP配置
});

// 初始化服务
(async () => {
  try {
    await llmService.initialize();
    // console.log('✅ LLM服务初始化成功');
  } catch (error) {
    console.error('❌ LLM服务初始化失败:', error.message);
  }

  try {
    await ttsService.initialize();
    // console.log('✅ TTS服务初始化成功');
  } catch (error) {
    console.error('❌ TTS服务初始化失败:', error.message);
  }

  try {
    await sttService.initialize();
  } catch (error) {
    console.error('❌ STT服务初始化失败:', error.message);
  }

  try {
    await voiceprintService.initialize();
    if (voiceprintService.isEnabled()) {
      console.log('✅ 声纹服务初始化成功');
    } else {
      console.log('ℹ️ 声纹服务未启用或配置不完整');
    }
  } catch (error) {
    console.error('❌ 声纹服务初始化失败:', error.message);
  }
})();

// 初始化OTA处理器
const otaHandler = new OTAHandler(config);

// 中间件配置
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 路由配置
app.use('/api/devices', deviceRoutes);
app.use('/api/sensors', sensorRoutes);

// OTA路由
app.get('/xiaozhi/ota/', (req, res) => {
  const result = otaHandler.handleGet();
  res.json(result);
});

app.post('/xiaozhi/ota/', async (req, res) => {
  try {
    const result = await otaHandler.handlePost(req);
    res.json(result);
  } catch (error) {
    logger.error('OTA POST处理失败:', error);
    res.status(500).json({ success: false, message: 'request error' });
  }
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 主页 - 重定向到管理页面
app.get('/', (req, res) => {
  res.redirect('/chat/index.html');
});

// 聊天客户端路由
app.get('/chat', (req, res) => {
  res.redirect('/chat/index.html');
});

// 管理页面路由
app.get('/manage', (req, res) => {
  res.redirect('/manage/index.html');
});

// API信息端点
app.get('/api', (req, res) => {
  res.json({
    message: '欢迎使用小智物联网后台服务器',
    version: '1.0.0',
    endpoints: {
      devices: '/api/devices',
      sensors: '/api/sensors',
      websocket: 'wss://localhost:' + PORT,
      ota: '/xiaozhi/ota/',
      health: '/health',
      chat: '/chat',
      manage: '/manage'
    }
  });
});

// WebSocket连接处理
wss.on('connection', (ws, req) => {
  handleWebSocketConnection(ws, req, wss, {
    llmService: llmService,
    ttsService: ttsService,
    sttService: sttService,
    voiceprintService: voiceprintService,
    sessionManager: sessionManager
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// 启动服务器
server.listen(PORT, () => {
  logger.info(`小智服务器启动成功，监听端口 ${PORT}`);
  logger.info(`WebSocket服务器运行在 ${WS_PROTOCOL}://localhost:${PORT}`);
  logger.info(`${USE_HTTPS ? 'HTTPS' : 'HTTP'}服务器运行在 ${PROTOCOL}://localhost:${PORT}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('收到 SIGINT 信号，正在关闭服务器...');
  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
});

export { app, server, wss };
