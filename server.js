import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { handleWebSocketConnection } from './websocket/handler.js';
import deviceRoutes from './routes/devices.js';
import sensorRoutes from './routes/sensors.js';
import { logger } from './utils/logger.js';
import OTAHandler from './core/ota-handler.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8000;

// 初始化OTA处理器
const config = {
  server: {
    port: PORT,
    http_port: PORT,
    auth_key: process.env.AUTH_KEY || 'xiaozhi-auth-secret-key'
  }
};
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

// 主页
app.get('/', (req, res) => {
  res.json({
    message: '欢迎使用小智物联网后台服务器',
    version: '1.0.0',
    endpoints: {
      devices: '/api/devices',
      sensors: '/api/sensors',
      websocket: 'ws://localhost:' + PORT,
      ota: '/xiaozhi/ota/',
      health: '/health'
    }
  });
});

// WebSocket连接处理
wss.on('connection', (ws, req) => {
  handleWebSocketConnection(ws, req, wss);
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
  logger.info(`WebSocket服务器运行在 ws://localhost:${PORT}`);
  logger.info(`HTTP服务器运行在 http://localhost:${PORT}`);
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