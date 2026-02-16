// 日志中间件
import { logger } from '../../utils/logger.js';

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

export default loggingMiddleware;