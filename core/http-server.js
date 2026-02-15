const express = require('express');
const path = require('path');
const { logger } = require('../utils/logger');
const OTAHandler = require('./ota-handler');

class HttpServer {
  constructor(config) {
    this.config = config;
    this.app = express();
    this.otaHandler = new OTAHandler(config);
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // CORS配置
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Device-ID, Client-ID, device-id, client-id, device-model, device-version, mac-address');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // 解析JSON和URL编码 - 确保能获取原始请求体
    this.app.use(express.json({ limit: '10mb', verify: (req, res, buf) => {
      req.rawBody = buf;
    } }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 静态文件服务
    this.app.use(express.static('public'));

    // 请求日志中间件
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // 健康检查端点
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });

    // OTA端点
    this.app.get('/xiaozhi/ota/', (req, res) => {
      const result = this.otaHandler.handleGet();
      res.send(result.message || JSON.stringify(result));
    });

    this.app.post('/xiaozhi/ota/', async (req, res) => {
      try {
        const result = await this.otaHandler.handlePost(req);
        res.json(result);
      } catch (error) {
        logger.error('OTA POST处理失败:', error);
        res.status(500).json({ success: false, message: 'request error' });
      }
    });

    this.app.options('/xiaozhi/ota/', (req, res) => {
      res.status(200).end();
    });

    // 固件下载端点
    this.app.get('/xiaozhi/ota/download/:filename', (req, res) => {
      res.download(
        path.join(this.otaHandler.binDir, req.params.filename),
        req.params.filename,
        (err) => {
          if (err) {
            logger.error('固件下载失败:', err);
            res.status(404).send('File not found');
          }
        }
      );
    });

    this.app.options('/xiaozhi/ota/download/:filename', (req, res) => {
      res.status(200).end();
    });

    // WebSocket服务器信息端点
    this.app.get('/websocket/info', (req, res) => {
      const serverConfig = this.config.server || {};
      const host = serverConfig.host || 'localhost';
      const port = serverConfig.port || 8000;
      
      res.json({
        websocket_url: `ws://${host}:${port}`,
        status: 'available',
        timestamp: new Date().toISOString()
      });
    });

    // 主页
    this.app.get('/', (req, res) => {
      const serverConfig = this.config.server || {};
      const host = serverConfig.host || 'localhost';
      const port = serverConfig.port || 8000;
      
      res.json({
        message: '欢迎使用小智物联网后台服务器',
        version: '1.0.0',
        services: {
          websocket: `ws://${host}:${port}`,
          http: `http://${host}:${port}`,
          health: '/health',
          websocket_info: '/websocket/info',
          ota: '/xiaozhi/ota/'
        },
        timestamp: new Date().toISOString()
      });
    });

    // 404处理
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });

    // 错误处理中间件
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * 获取WebSocket服务器URL
   * @param {string} localIp - 本地IP地址
   * @param {number} port - 端口号
   * @returns {string} WebSocket URL
   */
  getWebsocketUrl(localIp, port) {
    const serverConfig = this.config.server || {};
    const websocketConfig = serverConfig.websocket;
    
    if (websocketConfig && typeof websocketConfig === 'string') {
      return websocketConfig;
    } else {
      return `ws://${localIp}:${port}`;
    }
  }

  /**
   * 启动HTTP服务器
   * @param {number} port - 端口号
   * @param {string} host - 主机地址
   * @returns {Promise} 服务器实例
   */
  start(port, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(port, host, () => {
        logger.info(`HTTP服务器启动成功，监听端口 ${port}`);
        resolve(server);
      });

      server.on('error', (error) => {
        logger.error('HTTP服务器启动失败:', error);
        reject(error);
      });
    });
  }

  /**
   * 关闭HTTP服务器
   * @param {Object} server - 服务器实例
   * @returns {Promise}
   */
  close(server) {
    return new Promise((resolve) => {
      server.close(() => {
        logger.info('HTTP服务器已关闭');
        resolve();
      });
    });
  }

  getApp() {
    return this.app;
  }
}

module.exports = HttpServer;