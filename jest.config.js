module.exports = {
  // 测试环境
  testEnvironment: 'node',
  
  // 测试文件匹配模式
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // 忽略的文件
  testPathIgnorePatterns: [
    '/node_modules/',
    '/test/api-test.js',
    '/test/tts-test.js',
    '/test/websocket-*.js'
  ],
  
  // 模块模拟
  moduleNameMapper: {
    '^edge-tts-universal$': '<rootDir>/test/__mocks__/edge-tts-universal.js',
    '^../utils/logger$': '<rootDir>/test/__mocks__/logger.js',
    '^./services/base$': '<rootDir>/test/__mocks__/base-service.js',
    '^(\\.\\./utils/logger)$': '<rootDir>/test/__mocks__/logger.js'
  },
  
  // 代码覆盖率配置
  collectCoverageFrom: [
    'core/**/*.js',
    '!core/**/*.spec.js',
    '!core/**/__tests__/**'
  ],
  
  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  
  // 报告格式
  coverageReporters: ['text', 'lcov', 'html'],
  
  // 超时时间
  testTimeout: 10000,
  
  // 清理模拟
  clearMocks: true,
  
  // 随机测试顺序
  randomize: false,
  
  // 详细输出
  verbose: true
};
