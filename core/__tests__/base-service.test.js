/**
 * Base Service 单元测试
 */

const BaseService = require('../services/base');

describe('BaseService', () => {
  let service;

  beforeEach(() => {
    service = new BaseService('TestService', { test: true });
  });

  describe('构造函数', () => {
    test('应该正确初始化属性', () => {
      expect(service.name).toBe('TestService');
      expect(service.config).toEqual({ test: true });
      expect(service.enabled).toBe(true);
      expect(service.initialized).toBe(false);
    });

    test('应该处理enabled=false的情况', () => {
      const disabledService = new BaseService('DisabledService', { enabled: false });
      expect(disabledService.enabled).toBe(false);
    });
  });

  describe('initialize', () => {
    test('应该调用_initialize方法', async () => {
      const spy = jest.spyOn(service, '_initialize').mockResolvedValue();
      
      await service.initialize();
      
      expect(spy).toHaveBeenCalled();
      expect(service.initialized).toBe(true);
    });

    test('应该处理初始化失败', async () => {
      const error = new Error('初始化失败');
      jest.spyOn(service, '_initialize').mockRejectedValue(error);
      
      await expect(service.initialize()).rejects.toThrow('初始化失败');
      expect(service.initialized).toBe(false);
    });

    test('不应该重复初始化', async () => {
      service.initialized = true;
      const spy = jest.spyOn(service, '_initialize');
      
      const result = await service.initialize();
      
      expect(result).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    test('应该调用_destroy方法', async () => {
      service.initialized = true;
      const spy = jest.spyOn(service, '_destroy').mockResolvedValue();
      
      await service.destroy();
      
      expect(spy).toHaveBeenCalled();
      expect(service.initialized).toBe(false);
    });

    test('应该处理销毁失败', async () => {
      service.initialized = true;
      const error = new Error('销毁失败');
      jest.spyOn(service, '_destroy').mockRejectedValue(error);
      
      await expect(service.destroy()).rejects.toThrow('销毁失败');
    });

    test('不应该销毁未初始化的服务', async () => {
      const spy = jest.spyOn(service, '_destroy');
      
      await service.destroy();
      
      expect(spy).not.toHaveBeenCalled();
      expect(service.initialized).toBe(false);
    });
  });

  describe('isEnabled', () => {
    test('应该返回正确的启用状态', () => {
      service.enabled = true;
      service.initialized = true;
      expect(service.isEnabled()).toBe(true);
    });

    test('应该在未启用时返回false', () => {
      service.enabled = false;
      service.initialized = true;
      expect(service.isEnabled()).toBe(false);
    });

    test('应该在未初始化时返回false', () => {
      service.enabled = true;
      service.initialized = false;
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('getConfig & updateConfig', () => {
    test('应该返回配置', () => {
      expect(service.getConfig()).toEqual({ test: true });
    });

    test('应该更新配置', () => {
      service.updateConfig({ newProp: 'value' });
      expect(service.config).toEqual({ test: true, newProp: 'value' });
    });
  });

  describe('healthCheck', () => {
    test('应该在未初始化时返回uninitialized状态', async () => {
      const result = await service.healthCheck();
      expect(result).toEqual({
        status: 'uninitialized',
        message: '服务未初始化'
      });
    });

    test('应该在初始化后返回healthy状态', async () => {
      service.initialized = true;
      jest.spyOn(service, '_healthCheck').mockResolvedValue({ custom: 'data' });
      
      const result = await service.healthCheck();
      
      expect(result).toEqual({
        status: 'healthy',
        custom: 'data'
      });
    });

    test('应该处理健康检查失败', async () => {
      service.initialized = true;
      const error = new Error('健康检查失败');
      jest.spyOn(service, '_healthCheck').mockRejectedValue(error);
      
      const result = await service.healthCheck();
      
      expect(result).toEqual({
        status: 'unhealthy',
        error: '健康检查失败'
      });
    });
  });
});
