// 日志中间件
const { logger } = require('../../utils/logger');

function loggingMiddleware(req, res, next) {
  const start = Date.now();
  
  // 记录请求
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  
  // 监听响应结束事件
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  
  next();
}

module.exports = loggingMiddleware;