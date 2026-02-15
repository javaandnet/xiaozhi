/**
 * Auth Manager 单元测试
 */

const { AuthManager, AuthenticationError } = require('../auth');

describe('AuthManager', () => {
  let authManager;

  beforeEach(() => {
    authManager = new AuthManager('test-secret', 3600);
  });

  describe('构造函数', () => {
    test('应该正确初始化属性', () => {
      expect(authManager.secretKey).toBe('test-secret');
      expect(authManager.expireSeconds).toBe(3600);
      expect(authManager.authEnabled).toBe(false);
      expect(authManager.allowedDevices).toEqual([]);
    });
  });

  describe('setAuthEnabled', () => {
    test('应该启用认证', () => {
      authManager.setAuthEnabled(true);
      expect(authManager.authEnabled).toBe(true);
    });

    test('应该禁用认证', () => {
      authManager.setAuthEnabled(true);
      authManager.setAuthEnabled(false);
      expect(authManager.authEnabled).toBe(false);
    });
  });

  describe('setAllowedDevices', () => {
    test('应该设置白名单设备', () => {
      const devices = ['device1', 'device2'];
      authManager.setAllowedDevices(devices);
      expect(authManager.allowedDevices).toEqual(devices);
    });

    test('应该处理空数组', () => {
      authManager.setAllowedDevices([]);
      expect(authManager.allowedDevices).toEqual([]);
    });
  });

  describe('generateToken', () => {
    test('应该生成有效的JWT令牌', () => {
      const deviceId = 'test-device';
      const token = authManager.generateToken(deviceId);
      
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    test('应该在禁用认证时仍然生成令牌', () => {
      authManager.setAuthEnabled(false);
      const token = authManager.generateToken('test-device');
      expect(token).toBeTruthy();
    });
  });

  describe('validateToken', () => {
    test('应该验证有效的令牌', () => {
      const deviceId = 'test-device';
      const token = authManager.generateToken(deviceId);
      
      const isValid = authManager.validateToken(token, deviceId);
      expect(isValid).toBe(true);
    });

    test('应该拒绝无效的令牌', () => {
      const isValid = authManager.validateToken('invalid-token', 'test-device');
      expect(isValid).toBe(false);
    });

    test('应该拒绝设备ID不匹配的令牌', () => {
      const token = authManager.generateToken('device1');
      const isValid = authManager.validateToken(token, 'device2');
      expect(isValid).toBe(false);
    });

    test('应该允许白名单设备跳过验证', () => {
      authManager.setAuthEnabled(true);
      authManager.setAllowedDevices(['allowed-device']);
      
      // 白名单设备即使没有令牌也应该通过验证
      const isValid = authManager.validateToken(null, 'allowed-device');
      expect(isValid).toBe(true);
    });

    test('应该拒绝非白名单设备且无令牌的情况', () => {
      authManager.setAuthEnabled(true);
      authManager.setAllowedDevices(['allowed-device']);
      
      const isValid = authManager.validateToken(null, 'unauthorized-device');
      expect(isValid).toBe(false);
    });
  });

  describe('AuthenticationError', () => {
    test('应该正确创建错误实例', () => {
      const error = new AuthenticationError('认证失败', 'AUTH_FAILED');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('认证失败');
      expect(error.code).toBe('AUTH_FAILED');
      expect(error.name).toBe('AuthenticationError');
    });
  });
});
