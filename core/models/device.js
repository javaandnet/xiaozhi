import BaseModel from './base.js';

class DeviceModel extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.deviceId = data.deviceId || '';
    this.clientId = data.clientId || '';
    this.name = data.name || '';
    this.type = data.type || 'unknown';
    this.status = data.status || 'offline';
    this.ip = data.ip || '';
    this.mac = data.mac || '';
    this.version = data.version || '';
    this.capabilities = data.capabilities || [];
    this.lastSeen = data.lastSeen || new Date();
    this.battery = data.battery || null;
    this.signal = data.signal || null;
    this.location = data.location || null;
    this.metadata = data.metadata || {};
  }

  toJSON() {
    return {
      ...super.toJSON(),
      deviceId: this.deviceId,
      clientId: this.clientId,
      name: this.name,
      type: this.type,
      status: this.status,
      ip: this.ip,
      mac: this.mac,
      version: this.version,
      capabilities: this.capabilities,
      lastSeen: this.lastSeen,
      battery: this.battery,
      signal: this.signal,
      location: this.location,
      metadata: this.metadata
    };
  }

  isOnline() {
    return this.status === 'online' && 
           (new Date() - new Date(this.lastSeen)) < 120000; // 2分钟内
  }

  updateStatus(status) {
    this.status = status;
    this.lastSeen = new Date();
    this.updatedAt = new Date();
  }

  updateBattery(level) {
    this.battery = level;
    this.lastSeen = new Date();
    this.updatedAt = new Date();
  }

  static validate(data) {
    const errors = [];
    
    if (!data.deviceId) {
      errors.push('设备ID不能为空');
    }
    
    if (!data.clientId) {
      errors.push('客户端ID不能为空');
    }
    
    const validTypes = ['sensor', 'actuator', 'gateway', 'unknown'];
    if (data.type && !validTypes.includes(data.type)) {
      errors.push(`无效的设备类型: ${data.type}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default DeviceModel;