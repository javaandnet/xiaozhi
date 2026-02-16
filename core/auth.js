import crypto from 'crypto';
import { logger } from '../utils/logger.js';

class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class AuthManager {
  /**
   * 统一授权认证管理器
   * 生成与验证 client_id device_id token（HMAC-SHA256）认证三元组
   * token 中不含明文 client_id/device_id，只携带签名 + 时间戳
   */
  constructor(secretKey, expireSeconds = 60 * 60 * 24 * 30) {
    this.expireSeconds = expireSeconds > 0 ? expireSeconds : 60 * 60 * 24 * 30;
    this.secretKey = secretKey;
    this.allowedDevices = new Set(); // 设备白名单
    this.authEnabled = false;
  }

  /**
   * HMAC-SHA256签名并Base64编码
   * @param {string} content - 要签名的内容
   * @returns {string} 签名结果
   */
  _sign(content) {
    const sig = crypto
      .createHmac('sha256', this.secretKey)
      .update(content, 'utf8')
      .digest();
    return sig.toString('base64url');
  }

  /**
   * 生成 token
   * @param {string} clientId - 设备连接ID
   * @param {string} username - 设备用户名（通常为deviceId）
   * @returns {string} token字符串
   */
  generateToken(clientId, username) {
    const timestamp = Math.floor(Date.now() / 1000);
    const content = `${clientId}|${username}|${timestamp}`;
    const signature = this._sign(content);
    // token仅包含签名与时间戳，不包含明文信息
    return `${signature}.${timestamp}`;
  }

  /**
   * 验证token有效性
   * @param {string} token - 客户端传入的token
   * @param {string} clientId - 连接使用的client_id
   * @param {string} username - 连接使用的username
   * @returns {boolean} 验证结果
   */
  verifyToken(token, clientId, username) {
    try {
      const [sigPart, tsStr] = token.split('.');
      const timestamp = parseInt(tsStr);
      
      // 检查时间戳是否过期
      if (Math.floor(Date.now() / 1000) - timestamp > this.expireSeconds) {
        logger.debug('Token已过期');
        return false;
      }

      const expectedSig = this._sign(`${clientId}|${username}|${timestamp}`);
      
      // 使用安全比较防止时序攻击
      return crypto.timingSafeEqual(
        Buffer.from(sigPart),
        Buffer.from(expectedSig)
      );
    } catch (error) {
      logger.debug('Token验证失败:', error.message);
      return false;
    }
  }

  /**
   * 设置设备白名单
   * @param {Array<string>} devices - 允许的设备列表
   */
  setAllowedDevices(devices) {
    this.allowedDevices = new Set(devices);
  }

  /**
   * 检查设备是否在白名单中
   * @param {string} deviceId - 设备ID
   * @returns {boolean} 是否在白名单中
   */
  isDeviceAllowed(deviceId) {
    return this.allowedDevices.has(deviceId);
  }

  /**
   * 启用/禁用认证
   * @param {boolean} enabled - 是否启用认证
   */
  setAuthEnabled(enabled) {
    this.authEnabled = enabled;
  }

  /**
   * 处理认证逻辑
   * @param {Object} headers - 请求头
   * @returns {Object} 认证结果 { success: boolean, error?: string }
   */
  authenticate(headers) {
    if (!this.authEnabled) {
      return { success: true };
    }

    const deviceId = headers['device-id'] || headers['device_id'];
    const clientId = headers['client-id'] || headers['client_id'];
    let token = headers.authorization || headers.Authorization;

    // 处理 Bearer token 格式
    if (token && token.startsWith('Bearer ')) {
      token = token.substring(7);
    }

    // 检查白名单
    if (this.allowedDevices.size > 0 && this.isDeviceAllowed(deviceId)) {
      return { success: true };
    }

    // 验证必要字段
    if (!deviceId || !clientId || !token) {
      return { 
        success: false, 
        error: 'Missing required authentication headers' 
      };
    }

    // 验证token
    if (!this.verifyToken(token, clientId, deviceId)) {
      return { 
        success: false, 
        error: 'Invalid token' 
      };
    }

    return { success: true };
  }
}

export { AuthManager, AuthenticationError };