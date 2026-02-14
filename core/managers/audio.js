const AudioModel = require('../models/audio');
const { logger } = require('../../utils/logger');

class AudioManager {
  constructor() {
    this.audios = new Map(); // audioId -> AudioModel
    this.sessionAudios = new Map(); // sessionId -> [audioIds]
    this.maxAudios = 10000;
    this.maxAudioSize = 10 * 1024 * 1024; // 10MB
  }

  // 添加音频
  addAudio(audioData) {
    try {
      const validation = AudioModel.validate(audioData);
      if (!validation.valid) {
        throw new Error(`音频数据验证失败: ${validation.errors.join(', ')}`);
      }

      // 检查音频数量限制
      if (this.audios.size >= this.maxAudios) {
        this.cleanupOldAudios();
        if (this.audios.size >= this.maxAudios) {
          throw new Error(`音频数量已达上限: ${this.maxAudios}`);
        }
      }

      const audio = new AudioModel(audioData);
      
      // 检查音频大小
      if (audio.size > this.maxAudioSize) {
        throw new Error(`音频文件过大: ${audio.size} bytes`);
      }

      this.audios.set(audio.id, audio);
      
      // 更新会话音频映射
      if (audio.sessionId) {
        if (!this.sessionAudios.has(audio.sessionId)) {
          this.sessionAudios.set(audio.sessionId, []);
        }
        this.sessionAudios.get(audio.sessionId).push(audio.id);
      }
      
      logger.debug(`音频添加成功: ${audio.id} (${audio.sessionId})`);
      return audio;
    } catch (error) {
      logger.error(`添加音频失败:`, error);
      throw error;
    }
  }

  // 获取音频
  getAudio(audioId) {
    return this.audios.get(audioId);
  }

  // 获取会话的所有音频
  getSessionAudios(sessionId) {
    const audioIds = this.sessionAudios.get(sessionId) || [];
    return audioIds.map(id => this.audios.get(id)).filter(Boolean);
  }

  // 设置音频数据
  setAudioData(audioId, audioData) {
    const audio = this.audios.get(audioId);
    if (!audio) {
      throw new Error(`音频不存在: ${audioId}`);
    }

    audio.setData(audioData);
    logger.debug(`音频数据设置: ${audioId}, 大小: ${audio.size} bytes`);
    return audio;
  }

  // 设置转录文本
  setTranscription(audioId, text) {
    const audio = this.audios.get(audioId);
    if (!audio) {
      throw new Error(`音频不存在: ${audioId}`);
    }

    audio.setTranscription(text);
    logger.debug(`音频转录设置: ${audioId}`);
    return audio;
  }

  // 移除音频
  removeAudio(audioId) {
    const audio = this.audios.get(audioId);
    if (audio) {
      this.audios.delete(audioId);
      
      // 从会话音频列表中移除
      if (audio.sessionId) {
        const sessionAudios = this.sessionAudios.get(audio.sessionId);
        if (sessionAudios) {
          const index = sessionAudios.indexOf(audioId);
          if (index > -1) {
            sessionAudios.splice(index, 1);
          }
        }
      }
      
      logger.debug(`音频移除: ${audioId}`);
      return audio;
    }
    return null;
  }

  // 清理旧音频
  cleanupOldAudios(maxAgeHours = 24) {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const removedAudios = [];

    for (const [audioId, audio] of this.audios) {
      if (new Date(audio.timestamp) < cutoffTime) {
        removedAudios.push(this.removeAudio(audioId));
      }
    }

    if (removedAudios.length > 0) {
      logger.info(`清理旧音频: ${removedAudios.length}个`);
    }

    return removedAudios;
  }

  // 获取音频统计
  getStats() {
    const allAudios = Array.from(this.audios.values());
    const totalSize = allAudios.reduce((sum, audio) => sum + audio.size, 0);
    const processedAudios = allAudios.filter(audio => audio.processed).length;
    
    const formatStats = {};
    allAudios.forEach(audio => {
      const format = audio.format || 'unknown';
      formatStats[format] = (formatStats[format] || 0) + 1;
    });

    return {
      total: allAudios.length,
      processed: processedAudios,
      totalSize: totalSize,
      averageSize: allAudios.length > 0 ? Math.round(totalSize / allAudios.length) : 0,
      formats: formatStats,
      maxAudios: this.maxAudios
    };
  }

  // 搜索音频
  searchAudios(query) {
    const { sessionId, format, processed, minDuration, maxDuration } = query;
    let audios = Array.from(this.audios.values());

    if (sessionId) {
      audios = audios.filter(a => a.sessionId === sessionId);
    }

    if (format) {
      audios = audios.filter(a => a.format === format);
    }

    if (processed !== undefined) {
      audios = audios.filter(a => a.processed === processed);
    }

    if (minDuration !== undefined) {
      audios = audios.filter(a => a.duration >= minDuration);
    }

    if (maxDuration !== undefined) {
      audios = audios.filter(a => a.duration <= maxDuration);
    }

    return audios;
  }

  // 批量操作
  batchRemove(audioIds) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    audioIds.forEach(audioId => {
      try {
        this.removeAudio(audioId);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          audioId,
          error: error.message
        });
      }
    });

    return results;
  }

  // 音频转换（预留接口）
  async convertAudio(audioId, targetFormat) {
    const audio = this.getAudio(audioId);
    if (!audio) {
      throw new Error(`音频不存在: ${audioId}`);
    }

    // 这里应该调用实际的音频转换服务
    logger.info(`音频转换请求: ${audioId} -> ${targetFormat}`);
    
    // 模拟转换过程
    const convertedAudio = new AudioModel({
      ...audio.toJSON(),
      format: targetFormat,
      id: undefined // 生成新的ID
    });

    this.audios.set(convertedAudio.id, convertedAudio);
    return convertedAudio;
  }
}

module.exports = AudioManager;