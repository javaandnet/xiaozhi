import express from 'express';
import { webSocketHandler } from '../core/handlers/websocket.js';
import { logger } from '../utils/logger.js';
const router = express.Router();

// 获取所有传感器数据
router.get('/', (req, res) => {
  try {
    const {
      clientId,
      sensorType,
      limit = 50,
      startTime,
      endTime
    } = req.query;

    const sensorData = webSocketHandler.handler.deviceManager.getSensorData({
      clientId,
      sensorType,
      limit: parseInt(limit),
      startTime,
      endTime
    });

    res.json({
      success: true,
      count: sensorData.length,
      data: sensorData
    });
  } catch (error) {
    logger.error('获取传感器数据失败:', error);
    res.status(500).json({
      success: false,
      error: '获取传感器数据失败'
    });
  }
});

// 获取特定设备的传感器数据
router.get('/device/:clientId', (req, res) => {
  try {
    const { clientId } = req.params;
    const { sensorType, limit = 50 } = req.query;

    // 验证设备是否存在
    const device = webSocketHandler.handler.deviceManager.getDevice(clientId);
    if (!device) {
      return res.status(404).json({
        success: false,
        error: '设备不存在'
      });
    }

    const sensorData = webSocketHandler.handler.deviceManager.getDeviceSensorData(
      clientId,
      sensorType,
      parseInt(limit)
    );

    res.json({
      success: true,
      deviceId: device.deviceId,
      count: sensorData.length,
      data: sensorData
    });
  } catch (error) {
    logger.error('获取设备传感器数据失败:', error);
    res.status(500).json({
      success: false,
      error: '获取设备传感器数据失败'
    });
  }
});

// 获取特定类型的传感器数据统计
router.get('/stats/:sensorType', (req, res) => {
  try {
    const { sensorType } = req.params;
    const { hours = 24 } = req.query;

    // 计算时间范围
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    const sensorData = webSocketHandler.handler.deviceManager.getSensorData({
      sensorType,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    });

    if (sensorData.length === 0) {
      return res.json({
        success: true,
        sensorType,
        count: 0,
        stats: null
      });
    }

    // 计算统计数据
    const values = sensorData.map(d => parseFloat(d.value)).filter(v => !isNaN(v));

    let stats = null;
    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      stats = {
        count: values.length,
        average: Math.round(avg * 100) / 100,
        minimum: min,
        maximum: max,
        sum: Math.round(sum * 100) / 100
      };
    }

    res.json({
      success: true,
      sensorType,
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        hours: parseInt(hours)
      },
      count: sensorData.length,
      stats
    });
  } catch (error) {
    logger.error('获取传感器统计失败:', error);
    res.status(500).json({
      success: false,
      error: '获取传感器统计失败'
    });
  }
});

// 获取所有传感器类型
router.get('/types', (req, res) => {
  try {
    const allData = webSocketHandler.handler.deviceManager.getSensorData({ limit: 1000 });
    const sensorTypes = [...new Set(allData.map(d => d.sensorType))].sort();

    res.json({
      success: true,
      count: sensorTypes.length,
      types: sensorTypes
    });
  } catch (error) {
    logger.error('获取传感器类型失败:', error);
    res.status(500).json({
      success: false,
      error: '获取传感器类型失败'
    });
  }
});

// 获取实时传感器数据（最新数据）
router.get('/realtime', (req, res) => {
  try {
    const { sensorType, limit = 10 } = req.query;

    const sensorData = webSocketHandler.handler.deviceManager.getSensorData({
      sensorType,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      count: sensorData.length,
      data: sensorData
    });
  } catch (error) {
    logger.error('获取实时数据失败:', error);
    res.status(500).json({
      success: false,
      error: '获取实时数据失败'
    });
  }
});

// 获取传感器数据趋势
router.get('/trends/:sensorType', (req, res) => {
  try {
    const { sensorType } = req.params;
    const { hours = 24, interval = 'hour' } = req.query;

    // 计算时间范围
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    const sensorData = webSocketHandler.handler.deviceManager.getSensorData({
      sensorType,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    });

    // 按时间间隔分组计算平均值
    const trends = calculateTrends(sensorData, interval);

    res.json({
      success: true,
      sensorType,
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        hours: parseInt(hours)
      },
      interval,
      data: trends
    });
  } catch (error) {
    logger.error('获取趋势数据失败:', error);
    res.status(500).json({
      success: false,
      error: '获取趋势数据失败'
    });
  }
});

// 辅助函数：计算趋势数据
function calculateTrends(data, interval) {
  if (data.length === 0) return [];

  // 按时间排序
  const sortedData = data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const trends = [];
  const intervalMs = interval === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  let currentIntervalStart = new Date(sortedData[0].timestamp);
  let currentValues = [];

  for (const point of sortedData) {
    const pointTime = new Date(point.timestamp);

    // 如果超出当前区间，计算平均值并开始新区间
    if (pointTime >= new Date(currentIntervalStart.getTime() + intervalMs)) {
      if (currentValues.length > 0) {
        const avg = currentValues.reduce((sum, val) => sum + val, 0) / currentValues.length;
        trends.push({
          timestamp: currentIntervalStart.toISOString(),
          average: Math.round(avg * 100) / 100,
          count: currentValues.length
        });
      }

      currentIntervalStart = new Date(Math.floor(pointTime.getTime() / intervalMs) * intervalMs);
      currentValues = [parseFloat(point.value)];
    } else {
      currentValues.push(parseFloat(point.value));
    }
  }

  // 处理最后一个区间
  if (currentValues.length > 0) {
    const avg = currentValues.reduce((sum, val) => sum + val, 0) / currentValues.length;
    trends.push({
      timestamp: currentIntervalStart.toISOString(),
      average: Math.round(avg * 100) / 100,
      count: currentValues.length
    });
  }

  return trends;
}

export default router;