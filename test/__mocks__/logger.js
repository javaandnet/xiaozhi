/**
 * logger 模拟模块
 */

const logger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  bind: jest.fn().mockReturnThis()
};

module.exports = { logger };
