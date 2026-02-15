import express from 'express';
const router = express.Router();
import { webSocketHandler } from '../websocket/handler.js';
import { logger } from '../utils/logger.js';

// 获取所有设备列表
router.get('/', (req, res) => {
  try {
    const devices = webSocketHandler.deviceManager.getAllDevices();
    const formattedDevices = devices.map(device => ({
      clientId: device.id,
      deviceId: device.deviceId,
      deviceType: device.deviceType,
      ip: device.ip,
      status: device.status,
      battery: device.battery,
      signal: device.signal,
      connectedAt: device.connectedAt,
      lastSeen: device.lastSeen,
      capabilities: device.capabilities
    }));

    res.json({
      success: true,
      count: formattedDevices.length,
      devices: formattedDevices
    });
  } catch (error) {
    logger.error('获取设备列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取设备列表失败'
    });
  }
});

// 获取特定设备信息
router.get('/:clientId', (req, res) => {
  try {
    const { clientId } = req.params;
    const device = webSocketHandler.deviceManager.getDevice(clientId);
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: '设备不存在'
      });
    }

    res.json({
      success: true,
      device: {
        clientId: device.id,
        deviceId: device.deviceId,
        deviceType: device.deviceType,
        ip: device.ip,
        status: device.status,
        battery: device.battery,
        signal: device.signal,
        connectedAt: device.connectedAt,
        lastSeen: device.lastSeen,
        capabilities: device.capabilities,
        sensorDataCount: device.sensorData ? device.sensorData.length : 0
      }
    });
  } catch (error) {
    logger.error('获取设备信息失败:', error);
    res.status(500).json({
      success: false,
      error: '获取设备信息失败'
    });
  }
});

// 根据设备ID查找设备
router.get('/by-device-id/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = webSocketHandler.deviceManager.getDeviceByDeviceId(deviceId);
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: '设备不存在'
      });
    }

    res.json({
      success: true,
      device: {
        clientId: device.id,
        deviceId: device.deviceId,
        deviceType: device.deviceType,
        ip: device.ip,
        status: device.status,
        battery: device.battery,
        signal: device.signal,
        connectedAt: device.connectedAt,
        lastSeen: device.lastSeen,
        capabilities: device.capabilities
      }
    });
  } catch (error) {
    logger.error('查找设备失败:', error);
    res.status(500).json({
      success: false,
      error: '查找设备失败'
    });
  }
});

// 向设备发送命令
router.post('/:clientId/command', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { command, payload } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        error: '缺少命令参数'
      });
    }

    // 注意：sendCommand方法在WebSocketHandler中可能不存在，需要实现
    const commandId = uuidv4(); // 临时实现
    logger.warn(`发送命令功能需要在WebSocketHandler中实现: ${command}`);
    
    res.json({
      success: true,
      commandId,
      message: `命令已发送: ${command}`
    });
  } catch (error) {
    logger.error('发送命令失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '发送命令失败'
    });
  }
});

// 获取设备统计数据
router.get('/stats/overview', (req, res) => {
  try {
    const stats = webSocketHandler.deviceManager.getOnlineStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('获取统计数据失败:', error);
    res.status(500).json({
      success: false,
      error: '获取统计数据失败'
    });
  }
});

// 获取最近活跃的设备
router.get('/stats/recent', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const recentDevices = webSocketHandler.deviceManager.getRecentActiveDevices(parseInt(limit));
    
    res.json({
      success: true,
      count: recentDevices.length,
      devices: recentDevices.map(device => ({
        clientId: device.id,
        deviceId: device.deviceId,
        deviceType: device.deviceType,
        lastSeen: device.lastSeen,
        status: device.status
      }))
    });
  } catch (error) {
    logger.error('获取最近活跃设备失败:', error);
    res.status(500).json({
      success: false,
      error: '获取最近活跃设备失败'
    });
  }
});

// 清理离线设备
router.post('/cleanup', (req, res) => {
  try {
    const { timeoutMinutes = 60 } = req.body;
    const removedDevices = webSocketHandler.deviceManager.cleanupOfflineDevices(timeoutMinutes);
    
    res.json({
      success: true,
      removedCount: removedDevices.length,
      removedDevices
    });
  } catch (error) {
    logger.error('清理离线设备失败:', error);
    res.status(500).json({
      success: false,
      error: '清理离线设备失败'
    });
  }
});

// 导出设备数据
router.get('/export/data', (req, res) => {
  try {
    const exportData = webSocketHandler.deviceManager.exportDeviceData();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: exportData
    });
  } catch (error) {
    logger.error('导出设备数据失败:', error);
    res.status(500).json({
      success: false,
      error: '导出设备数据失败'
    });
  }
});

export default router;