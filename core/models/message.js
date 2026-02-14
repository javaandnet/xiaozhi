const BaseModel = require('./base');

class MessageModel extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.sessionId = data.sessionId || '';
    this.clientId = data.clientId || '';
    this.type = data.type || 'text'; // text, audio, command, system
    this.direction = data.direction || 'inbound'; // inbound, outbound
    this.content = data.content || '';
    this.contentType = data.contentType || 'json'; // json, text, binary
    this.timestamp = data.timestamp || new Date();
    this.processed = data.processed || false;
    this.metadata = data.metadata || {};
  }

  toJSON() {
    return {
      ...super.toJSON(),
      sessionId: this.sessionId,
      clientId: this.clientId,
      type: this.type,
      direction: this.direction,
      content: this.content,
      contentType: this.contentType,
      timestamp: this.timestamp,
      processed: this.processed,
      metadata: this.metadata
    };
  }

  markProcessed() {
    this.processed = true;
    this.updatedAt = new Date();
  }

  isAudio() {
    return this.type === 'audio';
  }

  isText() {
    return this.type === 'text';
  }

  isInbound() {
    return this.direction === 'inbound';
  }

  isOutbound() {
    return this.direction === 'outbound';
  }

  static validate(data) {
    const errors = [];
    
    if (!data.sessionId) {
      errors.push('会话ID不能为空');
    }
    
    if (!data.clientId) {
      errors.push('客户端ID不能为空');
    }
    
    const validTypes = ['text', 'audio', 'command', 'system'];
    if (data.type && !validTypes.includes(data.type)) {
      errors.push(`无效的消息类型: ${data.type}`);
    }
    
    const validDirections = ['inbound', 'outbound'];
    if (data.direction && !validDirections.includes(data.direction)) {
      errors.push(`无效的消息方向: ${data.direction}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = MessageModel;