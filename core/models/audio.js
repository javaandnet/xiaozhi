const BaseModel = require('./base');

class AudioModel extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.sessionId = data.sessionId || '';
    this.clientId = data.clientId || '';
    this.format = data.format || 'opus';
    this.sampleRate = data.sampleRate || 16000;
    this.channels = data.channels || 1;
    this.duration = data.duration || 0; // 毫秒
    this.size = data.size || 0; // 字节
    this.data = data.data || null; // 音频数据
    this.timestamp = data.timestamp || new Date();
    this.processed = data.processed || false;
    this.transcription = data.transcription || ''; // 转录文本
    this.metadata = data.metadata || {};
  }

  toJSON() {
    return {
      ...super.toJSON(),
      sessionId: this.sessionId,
      clientId: this.clientId,
      format: this.format,
      sampleRate: this.sampleRate,
      channels: this.channels,
      duration: this.duration,
      size: this.size,
      timestamp: this.timestamp,
      processed: this.processed,
      transcription: this.transcription,
      metadata: this.metadata
    };
  }

  setData(audioData) {
    this.data = audioData;
    this.size = audioData ? audioData.length : 0;
    this.updatedAt = new Date();
  }

  setTranscription(text) {
    this.transcription = text;
    this.processed = true;
    this.updatedAt = new Date();
  }

  isValid() {
    return this.data && this.size > 0 && this.duration > 0;
  }

  getDurationInSeconds() {
    return this.duration / 1000;
  }

  static validate(data) {
    const errors = [];
    
    if (!data.sessionId) {
      errors.push('会话ID不能为空');
    }
    
    if (!data.clientId) {
      errors.push('客户端ID不能为空');
    }
    
    const validFormats = ['opus', 'pcm', 'wav', 'mp3'];
    if (data.format && !validFormats.includes(data.format)) {
      errors.push(`不支持的音频格式: ${data.format}`);
    }
    
    if (data.sampleRate && ![8000, 16000, 22050, 44100, 48000].includes(data.sampleRate)) {
      errors.push(`不支持的采样率: ${data.sampleRate}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = AudioModel;