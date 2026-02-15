const config = require('./config');
const XiaoZhiServer = require('./core/server');
const { logger } = require('./utils/logger');

async function main() {
  try {
    logger.info('启动小智物联网后台服务器...');
    
    // 创建服务器实例
    const server = new XiaoZhiServer(config);
    
    // 初始化服务器
    await server.initialize();
    
    // 启动服务器
    await server.start();
    
    // 显示服务器信息
    logger.info('=== 服务器信息 ===');
    logger.info(`环境: ${config.server.environment}`);
    logger.info(`主机: ${config.server.host}`);
    logger.info(`WebSocket端口: ${config.server.port}`);
    logger.info(`HTTP端口: ${config.server.http_port}`);
    logger.info(`认证启用: ${config.server.auth.enabled}`);
    if (config.server.auth.allowed_devices.length > 0) {
      logger.info(`白名单设备: ${config.server.auth.allowed_devices.join(', ')}`);
    }
    logger.info('==================');
    
  } catch (error) {
    logger.error('服务器启动失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

module.exports = { main, XiaoZhiServer };