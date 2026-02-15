import moment from 'moment';

class DeviceManager {
  constructor() {
    this.devices = new Map(); // 存储设备连接信息
    this.sensorData = []; // 存储传感器数据历史
    this.maxSensorData = 1000; // 最大传感器数据存储数量
  }

  // 添加设备
  addDevice(deviceInfo) {
    const device = {
      id: deviceInfo.id,
      deviceId: deviceInfo.deviceId || deviceInfo.id,
      deviceType: deviceInfo.deviceType || 'unknown',
      ip: deviceInfo.ip,
      connection: deviceInfo.connection,
      connectedAt: deviceInfo.connectedAt || new Date(),
      lastSeen: new Date(),
      status: 'online',
      battery: null,
      signal: null,
      capabilities: deviceInfo.capabilities || [],
      sensorData: []
    };

    this.devices.set(device.id, device);
    return device;
  }

  // 移除设备
  removeDevice(clientId) {
    const device = this.devices.get(clientId);
    if (device) {
      // 将最后的状态数据保存
      device.status = 'offline';
      device.disconnectedAt = new Date();
      this.devices.delete(clientId);
    }
  }

  // 获取设备
  getDevice(clientId) {
    return this.devices.get(clientId);
  }

  // 获取所有设备
  getAllDevices() {
    return Array.from(this.devices.values());
  }

  // 根据设备ID查找
  getDeviceByDeviceId(deviceId) {
    for (let device of this.devices.values()) {
      if (device.deviceId === deviceId) {
        return device;
      }
    }
    return null;
  }

  // 更新设备信息
  updateDevice(clientId, updates) {
    const device = this.devices.get(clientId);
    if (device) {
      Object.assign(device, updates);
      device.lastSeen = new Date();
      this.devices.set(clientId, device);
      return device;
    }
    return null;
  }

  // 添加传感器数据
  addSensorData(data) {
    const sensorEntry = {
      ...data,
      id: Date.now() + Math.random(), // 简单的唯一ID生成
      receivedAt: new Date()
    };

    this.sensorData.push(sensorEntry);
    
    // 维护数据大小限制
    if (this.sensorData.length > this.maxSensorData) {
      this.sensorData.shift();
    }

    // 同时存储到对应设备
    const device = this.devices.get(data.clientId);
    if (device) {
      device.sensorData.push(sensorEntry);
      // 每个设备最多保留100条数据
      if (device.sensorData.length > 100) {
        device.sensorData.shift();
      }
    }

    return sensorEntry;
  }

  // 获取传感器数据
  getSensorData(options = {}) {
    const { 
      clientId, 
      sensorType, 
      limit = 50, 
      startTime, 
      endTime 
    } = options;

    let filteredData = [...this.sensorData];

    // 按客户端ID过滤
    if (clientId) {
      filteredData = filteredData.filter(data => data.clientId === clientId);
    }

    // 按传感器类型过滤
    if (sensorType) {
      filteredData = filteredData.filter(data => data.sensorType === sensorType);
    }

    // 按时间范围过滤
    if (startTime) {
      filteredData = filteredData.filter(data => new Date(data.timestamp) >= new Date(startTime));
    }

    if (endTime) {
      filteredData = filteredData.filter(data => new Date(data.timestamp) <= new Date(endTime));
    }

    // 按时间排序并限制数量
    return filteredData
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  // 获取特定设备的传感器数据
  getDeviceSensorData(clientId, sensorType = null, limit = 50) {
    const device = this.devices.get(clientId);
    if (!device) return [];

    let data = device.sensorData || [];
    
    if (sensorType) {
      data = data.filter(d => d.sensorType === sensorType);
    }

    return data
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  // 获取在线设备统计
  getOnlineStats() {
    const allDevices = this.getAllDevices();
    const onlineDevices = allDevices.filter(device => device.status === 'online');
    
    return {
      total: allDevices.length,
      online: onlineDevices.length,
      offline: allDevices.length - onlineDevices.length,
      deviceTypes: this.getDeviceTypeStats()
    };
  }

  // 获取设备类型统计
  getDeviceTypeStats() {
    const stats = {};
    this.devices.forEach(device => {
      const type = device.deviceType || 'unknown';
      stats[type] = (stats[type] || 0) + 1;
    });
    return stats;
  }

  // 清理离线设备（超过指定时间未活动的设备）
  cleanupOfflineDevices(timeoutMinutes = 60) {
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    const removedDevices = [];

    this.devices.forEach((device, clientId) => {
      if (device.lastSeen < cutoffTime) {
        removedDevices.push({
          clientId: device.id,
          deviceId: device.deviceId,
          disconnectedAt: new Date()
        });
        this.devices.delete(clientId);
      }
    });

    return removedDevices;
  }

  // 获取最近活动的设备
  getRecentActiveDevices(limit = 10) {
    return this.getAllDevices()
      .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
      .slice(0, limit);
  }

  // 导出设备数据
  exportDeviceData() {
    return {
      devices: this.getAllDevices().map(device => ({
        id: device.id,
        deviceId: device.deviceId,
        deviceType: device.deviceType,
        ip: device.ip,
        connectedAt: device.connectedAt,
        lastSeen: device.lastSeen,
        status: device.status,
        battery: device.battery,
        signal: device.signal,
        capabilities: device.capabilities
      })),
      sensorDataCount: this.sensorData.length,
      stats: this.getOnlineStats()
    };
  }
}

export default DeviceManager;