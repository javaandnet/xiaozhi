const http = require('http');
const WebSocket = require('ws');
const { logger } = require('../utils/logger');
const HttpServer = require('./http-server');
const WebSocketServer = require('./websocket-server');
const LLMService = require('./llm-service');

class XiaoZhiServer {
  constructor(config) {
    this.config = config;
    this.httpServer = null;
    this.websocketServer = null;
    this.wss = null; // WebSocket服务器实例
    this.llmService = null; // LLM服务
  }

  /**
   * 初始化服务器
   */
  async initialize() {
    try {
      logger.info('正在初始化小智服务器...');
      
      // 创建LLM服务
      this.llmService = new LLMService(this.config);
      if (this.llmService.isConfigured()) {
        logger.info(`LLM服务已配置: ${this.llmService.model}`);
      } else {
        logger.warn('LLM API Key未配置，将使用模拟回复');
      }
      
      // 创建HTTP服务器
      this.httpServer = new HttpServer(this.config);
      
      // 创建WebSocket服务器（传入LLM服务）
      this.websocketServer = new WebSocketServer(this.config, this.llmService);
      
      logger.info('服务器初始化完成');
    } catch (error) {
      logger.error('服务器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动服务器
   */
  async start() {
    try {
      const serverConfig = this.config.server || {};
      const host = serverConfig.host || '0.0.0.0';
      const port = serverConfig.port || 8000;
      const httpPort = serverConfig.http_port || port;

      // 启动HTTP服务器
      const httpInstance = await this.httpServer.start(httpPort, host);
      
      // 创建WebSocket服务器（与HTTP服务器共享端口）
      const server = httpInstance; // 使用HTTP服务器作为底层服务器
      this.wss = new WebSocket.Server({ server });

      // 设置WebSocket连接处理
      this.wss.on('connection', (ws, req) => {
        this.websocketServer.handleConnection(ws, req);
      });

      logger.info(`小智服务器启动成功`);
      logger.info(`HTTP服务器: http://${host}:${httpPort}`);
      logger.info(`WebSocket服务器: ws://${host}:${httpPort}`);

      // 设置优雅关闭
      this.setupGracefulShutdown(server);

      return server;
    } catch (error) {
      logger.error('服务器启动失败:', error);
      throw error;
    }
  }

  /**
   * 设置优雅关闭
   */
  setupGracefulShutdown(server) {
    const shutdown = async () => {
      logger.info('收到关闭信号，正在关闭服务器...');
      
      try {
        // 关闭WebSocket连接
        if (this.wss) {
          this.websocketServer.closeAllConnections();
          this.wss.close();
        }
        
        // 关闭HTTP服务器
        await new Promise((resolve) => {
          server.close(() => {
            logger.info('HTTP服务器已关闭');
            resolve();
          });
        });
        
        logger.info('服务器已完全关闭');
        process.exit(0);
      } catch (error) {
        logger.error('关闭过程中出现错误:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  /**
   * 获取服务器统计信息
   */
  getStats() {
    return {
      websocket: this.websocketServer ? this.websocketServer.getStats() : null,
      http: {
        status: this.httpServer ? 'running' : 'stopped'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 广播消息
   */
  broadcast(message) {
    if (this.websocketServer) {
      this.websocketServer.broadcast(message);
    }
  }

  /**
   * 关闭服务器
   */
  async close() {
    if (this.websocketServer) {
      this.websocketServer.closeAllConnections();
    }
    
    if (this.httpServer && this.httpServer.server) {
      await this.httpServer.close(this.httpServer.server);
    }
  }
}

module.exports = XiaoZhiServer;