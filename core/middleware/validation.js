// 验证中间件
const { logger } = require('../../utils/logger');

function validationMiddleware(schema) {
  return (req, res, next) => {
    if (!schema) {
      return next();
    }
    
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      logger.warn(`验证失败: ${error.details[0].message}`);
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message
      });
    }
    
    req.validatedData = value;
    next();
  };
}

module.exports = validationMiddleware;