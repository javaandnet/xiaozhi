const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const { handleWebSocketConnection } = require('./websocket/handler');
const deviceRoutes = require('./routes/devices');
const sensorRoutes = require('./routes/sensors');
const { logger } = require('./utils/logger');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8000;

// 中间件配置
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 路由配置
app.use('/api/devices', deviceRoutes);
app.use('/api/sensors', sensorRoutes);

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

module.exports = { app, server, wss };