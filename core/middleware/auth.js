// 认证中间件
const { logger } = require('../../utils/logger');

function authMiddleware(req, res, next) {
  // 简单的API密钥认证
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validApiKey = process.env.API_KEY || 'xiaozhi-default-key';
  
  if (apiKey && apiKey === validApiKey) {
    req.authenticated = true;
    next();
  } else {
    logger.warn(`认证失败: ${req.ip} - ${req.path}`);
    res.status(401).json({
      error: 'Unauthorized',
      message: '无效的API密钥'
    });
  }
}

module.exports = authMiddleware;