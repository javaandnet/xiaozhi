const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

// 引入核心模块
const core = require('./core');
const { logger } = require('./utils/logger');

class XiaoZhiServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    
    // 初始化核心组件
    this.deviceManager = new core.managers.Device();
    this.sessionManager = new core.managers.Session();
    this.audioManager = new core.managers.Audio();
    
    // 初始化服务
    this.ttsService = new core.services.Tts(core.config.services.tts);
    this.sttService = new core.services.Stt(core.config.services.stt);
    this.wakeWordService = new core.services.WakeWord(core.config.services.wakeword);
    
    this.websocketHandler = new core.handlers.WebSocket({
      wss: this.wss,
      deviceManager: this.deviceManager,
      sessionManager: this.sessionManager,
      audioManager: this.audioManager,
      ttsService: this.ttsService,
      sttService: this.sttService,
      wakeWordService: this.wakeWordService
    });
  }

  async initialize() {
    try {
      // 初始化中间件
      this.setupMiddleware();
      
      // 初始化路由
      this.setupRoutes();
      
      // 初始化服务
      await this.initializeServices();
      
      // 初始化WebSocket处理器
      this.setupWebSocket();
      
      logger.info('小智服务器初始化完成');
    } catch (error) {
      logger.error('服务器初始化失败:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // CORS配置
    this.app.use(cors(core.config.security.cors));
    
    // 解析JSON和URL编码
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // 静态文件服务
    this.app.use(express.static('public'));
    
    // 日志中间件
    this.app.use(core.middleware.Logging);
    
    // 认证中间件
    this.app.use('/api/*', core.middleware.Auth);
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

    // 主页
    this.app.get('/', (req, res) => {
      res.json({
        message: '欢迎使用小智物联网后台服务器',
        version: '1.0.0',
        endpoints: {
          devices: '/api/devices',
          sessions: '/api/sessions',
          audio: '/api/audio',
          health: '/health'
        }
      });
    });

    // API路由
    this.app.use('/api/devices', require('./routes/devices'));
    this.app.use('/api/sensors', require('./routes/sensors'));
    this.app.use('/api/sessions', require('./routes/sessions'));
    this.app.use('/api/audio', require('./routes/audio'));
    
    // 404处理
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`
      });
    });

    // 错误处理中间件
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    });
  }

  async initializeServices() {
    try {
      await this.ttsService.initialize();
      await this.sttService.initialize();
      await this.wakeWordService.initialize();
      
      // 设置唤醒词检测回调
      this.setupWakeWordCallbacks();
      
      logger.info('服务初始化完成');
    } catch (error) {
      logger.error('服务初始化失败:', error);
      throw error;
    }
  }

  setupWakeWordCallbacks() {
    // 设置唤醒词检测回调
    this.wakeWordService.setWakeWordCallback((result) => {
      console.log(`唤醒词检测回调触发: ${result.keyword}, 置信度: ${result.confidence}`);
      // 这里可以触发全局事件或通知其他服务
    });
    
    // 在STT服务中也设置唤醒词回调
    this.sttService.setWakeWordCallback((result) => {
      console.log(`STT服务唤醒词回调: ${result.keyword}`);
      // 可以在这里处理唤醒词触发的业务逻辑
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      this.websocketHandler.handleConnection(ws, req);
    });
  }

  async start() {
    try {
      await this.initialize();
      
      const port = core.config.server.port;
      const host = core.config.server.host;
      
      this.server.listen(port, host, () => {
        logger.info(`小智服务器启动成功，监听端口 ${port}`);
        logger.info(`WebSocket服务器运行在 ws://${host}:${port}`);
      });

      // 设置优雅关闭
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('服务器启动失败:', error);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async () => {
      logger.info('收到关闭信号，正在关闭服务器...');
      
      try {
        // 关闭WebSocket连接
        this.wss.clients.forEach(client => {
          client.terminate();
        });
        
        // 销毁服务
        await this.ttsService.destroy();
        await this.sttService.destroy();
        await this.wakeWordService.destroy();
        
        // 关闭HTTP服务器
        this.server.close(() => {
          logger.info('服务器已关闭');
          process.exit(0);
        });
        
      } catch (error) {
        logger.error('关闭过程中出现错误:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  getStats() {
    return {
      devices: this.deviceManager.getStats(),
      sessions: this.sessionManager.getStats(),
      audio: this.audioManager.getStats(),
      services: {
        tts: this.ttsService.isEnabled(),
        stt: this.sttService.isEnabled(),
        wakeWord: this.wakeWordService.isEnabled()
      }
    };
  }
}

// 创建并启动服务器
const server = new XiaoZhiServer();

if (require.main === module) {
  server.start().catch(error => {
    logger.error('服务器启动异常:', error);
    process.exit(1);
  });
}

module.exports = { XiaoZhiServer, server };