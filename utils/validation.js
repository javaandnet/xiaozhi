const moment = require('moment');

// 验证设备ID格式
function validateDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') {
    return { valid: false, error: '设备ID不能为空且必须是字符串' };
  }
  
  if (deviceId.length < 3 || deviceId.length > 50) {
    return { valid: false, error: '设备ID长度必须在3-50字符之间' };
  }
  
  // 只允许字母、数字、连字符和下划线
  const deviceIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!deviceIdRegex.test(deviceId)) {
    return { valid: false, error: '设备ID只能包含字母、数字、连字符和下划线' };
  }
  
  return { valid: true };
}

// 验证传感器数据
function validateSensorData(data) {
  const errors = [];
  
  if (!data.sensorType) {
    errors.push('传感器类型不能为空');
  }
  
  if (data.value === undefined || data.value === null) {
    errors.push('传感器数值不能为空');
  }
  
  if (typeof data.value !== 'number' && isNaN(parseFloat(data.value))) {
    errors.push('传感器数值必须是数字');
  }
  
  if (data.timestamp && !moment(data.timestamp).isValid()) {
    errors.push('时间戳格式无效');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// 验证命令格式
function validateCommand(command, payload) {
  const validCommands = [
    'led_on', 'led_off', 'led_toggle',
    'relay_on', 'relay_off', 'relay_toggle',
    'servo_move', 'motor_control',
    'get_sensor_data', 'set_config',
    'reboot', 'reset'
  ];
  
  if (!validCommands.includes(command)) {
    return { valid: false, error: `不支持的命令: ${command}` };
  }
  
  // 根据不同命令验证payload
  switch (command) {
    case 'servo_move':
      if (!payload || typeof payload.angle !== 'number') {
        return { valid: false, error: '舵机控制需要角度参数' };
      }
      if (payload.angle < 0 || payload.angle > 180) {
        return { valid: false, error: '舵机角度必须在0-180度之间' };
      }
      break;
      
    case 'motor_control':
      if (!payload || typeof payload.speed !== 'number') {
        return { valid: false, error: '电机控制需要速度参数' };
      }
      if (payload.speed < -100 || payload.speed > 100) {
        return { valid: false, error: '电机速度必须在-100到100之间' };
      }
      break;
  }
  
  return { valid: true };
}

// 格式化设备信息
function formatDeviceInfo(device) {
  return {
    clientId: device.id,
    deviceId: device.deviceId,
    deviceType: device.deviceType,
    ip: device.ip,
    status: device.status,
    battery: device.battery,
    signal: device.signal,
    connectedAt: device.connectedAt,
    lastActivity: device.lastActivity,
    capabilities: device.capabilities || []
  };
}

// 格式化传感器数据
function formatSensorData(data) {
  return {
    id: data.id,
    clientId: data.clientId,
    sensorType: data.sensorType,
    value: data.value,
    unit: data.unit || '',
    timestamp: data.timestamp,
    receivedAt: data.receivedAt
  };
}

// 计算数据统计
function calculateStatistics(dataArray, valueField = 'value') {
  if (!dataArray || dataArray.length === 0) {
    return null;
  }
  
  const values = dataArray
    .map(item => parseFloat(item[valueField]))
    .filter(val => !isNaN(val));
    
  if (values.length === 0) {
    return null;
  }
  
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  return {
    count: values.length,
    sum: Math.round(sum * 100) / 100,
    average: Math.round(avg * 100) / 100,
    minimum: min,
    maximum: max,
    range: max - min
  };
}

// 时间格式化工具
function formatTime(date) {
  return moment(date).format('YYYY-MM-DD HH:mm:ss');
}

function timeAgo(date) {
  return moment(date).fromNow();
}

// 生成随机ID
function generateId(prefix = '') {
  return prefix + Date.now() + Math.random().toString(36).substr(2, 9);
}

// 深度克隆对象
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 节流函数
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

module.exports = {
  validateDeviceId,
  validateSensorData,
  validateCommand,
  formatDeviceInfo,
  formatSensorData,
  calculateStatistics,
  formatTime,
  timeAgo,
  generateId,
  deepClone,
  debounce,
  throttle
};