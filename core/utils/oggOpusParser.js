/**
 * Ogg Opus 解析器
 * 用于从 Ogg Opus 流中提取原始 Opus 帧
 */
class OggOpusParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.granulePosition = 0;
    this.serialNumber = null;
    this.pageSequence = 0;
  }

  /**
   * 解析 Ogg 页面头部
   * @param {Buffer} data - Ogg 页面数据
   * @returns {Object|null} 页面信息
   */
  parsePageHeader(data) {
    // Ogg 页面必须以 "OggS" 开头
    if (data.length < 27) return null;
    if (data[0] !== 0x4f || data[1] !== 0x67 || data[2] !== 0x67 || data[3] !== 0x53) {
      return null;
    }

    const headerType = data[5];
    const granulePosition = data.readUIntLE(6, 8);
    const serialNumber = data.readUInt32LE(14);
    const pageSequence = data.readUInt32LE(18);
    const segments = data[26];

    return {
      headerType,
      granulePosition,
      serialNumber,
      pageSequence,
      segments,
      isBos: (headerType & 0x02) !== 0,  // 开始流
      isEos: (headerType & 0x04) !== 0,  // 结束流
      isContinuation: (headerType & 0x01) !== 0  // 延续页
    };
  }

  /**
   * 从 Ogg 页面中提取 Opus 包
   * @param {Buffer} pageData - Ogg 页面数据
   * @returns {Buffer[]} Opus 包数组
   */
  extractPackets(pageData) {
    if (pageData.length < 27) return [];

    const segments = pageData[26];
    const segmentTable = pageData.slice(27, 27 + segments);
    
    // 计算数据起始位置
    const dataStart = 27 + segments;
    const packets = [];
    
    let offset = dataStart;
    let packetSize = 0;

    for (let i = 0; i < segments; i++) {
      const segmentSize = segmentTable[i];
      packetSize += segmentSize;

      // 如果段大小小于 255，表示包结束
      if (segmentSize < 255) {
        if (offset + packetSize <= pageData.length) {
          const packet = pageData.slice(offset, offset + packetSize);
          
          // 跳过 Opus 头和 Opus 标签页（前两页）
          // Opus 头页以 "OpusHead" 开头
          // Opus 标签页以 "OpusTags" 开头
          if (packet.length >= 8) {
            const headerId = packet.slice(0, 8).toString('ascii');
            if (headerId !== 'OpusHead' && headerId !== 'OpusTags') {
              packets.push(packet);
            }
          } else {
            packets.push(packet);
          }
        }
        offset += packetSize;
        packetSize = 0;
      }
    }

    // 处理最后一个未完成的包（延续到下一页）
    if (packetSize > 0 && offset + packetSize <= pageData.length) {
      const packet = pageData.slice(offset, offset + packetSize);
      packets.push(packet);
    }

    return packets;
  }

  /**
   * 解析 Ogg 流并提取 Opus 帧
   * @param {Buffer} data - Ogg 流数据
   * @returns {Buffer[]} Opus 帧数组
   */
  parse(data) {
    // 合并缓冲区
    this.buffer = Buffer.concat([this.buffer, data]);
    
    const packets = [];
    
    while (this.buffer.length >= 27) {
      // 查找 Ogg 页面魔数
      let pageStart = -1;
      for (let i = 0; i <= this.buffer.length - 4; i++) {
        if (this.buffer[i] === 0x4f && 
            this.buffer[i + 1] === 0x67 && 
            this.buffer[i + 2] === 0x67 && 
            this.buffer[i + 3] === 0x53) {
          pageStart = i;
          break;
        }
      }

      if (pageStart === -1) {
        // 没有找到页面，清空缓冲区
        this.buffer = Buffer.alloc(0);
        break;
      }

      // 丢弃页面之前的数据
      if (pageStart > 0) {
        this.buffer = this.buffer.slice(pageStart);
      }

      // 检查是否有足够的数据读取头部
      if (this.buffer.length < 27) break;

      const segments = this.buffer[26];
      const headerSize = 27 + segments;

      // 计算页面总大小
      let pageSize = headerSize;
      for (let i = 0; i < segments; i++) {
        pageSize += this.buffer[27 + i];
      }

      // 如果数据不足，等待更多数据
      if (this.buffer.length < pageSize) break;

      // 提取页面数据
      const pageData = this.buffer.slice(0, pageSize);
      
      // 提取 Opus 包
      const pagePackets = this.extractPackets(pageData);
      packets.push(...pagePackets);

      // 移除已处理的数据
      this.buffer = this.buffer.slice(pageSize);
    }

    return packets;
  }

  /**
   * 重置解析器状态
   */
  reset() {
    this.buffer = Buffer.alloc(0);
    this.granulePosition = 0;
    this.serialNumber = null;
    this.pageSequence = 0;
  }
}

export default OggOpusParser;
