import { spawn } from 'child_process';

/**
 * WebM/Ogg 音频解码器
 * 使用 FFmpeg 将 WebM/Ogg 容器中的 Opus 音频转换为 PCM
 */
class WebmOpusDecoder {
  constructor() {
    this.sampleRate = 16000;
    this.channels = 1;
  }

  /**
   * 检测音频格式
   * @param {Buffer} data - 音频数据
   * @returns {string} 格式类型: 'webm', 'ogg', 'opus', 'unknown'
   */
  detectFormat(data) {
    if (data.length < 4) return 'unknown';
    
    // WebM/MKV 魔数
    if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) {
      return 'webm';
    }
    
    // Ogg 魔数
    if (data[0] === 0x4f && data[1] === 0x67 && data[2] === 0x67 && data[3] === 0x53) {
      return 'ogg';
    }
    
    // 纯 Opus 帧（没有容器）- 通常较小且不符合上述格式
    return 'opus';
  }

  /**
   * 使用 FFmpeg 解码音频数据为 PCM
   * @param {Buffer} audioData - WebM/Ogg/Opus 音频数据
   * @returns {Promise<Buffer>} PCM 数据
   */
  async decodeToPcm(audioData) {
    return new Promise((resolve, reject) => {
      const format = this.detectFormat(audioData);
      
      // 构造 FFmpeg 输入参数
      let inputFormat = '';
      if (format === 'webm') {
        inputFormat = '-f webm';
      } else if (format === 'ogg') {
        inputFormat = '-f ogg';
      }

      const ffmpegArgs = [
        '-i', 'pipe:0',           // 从 stdin 读取
        '-f', 's16le',            // 输出格式: 16位有符号小端 PCM
        '-ar', '16000',           // 采样率: 16000Hz
        '-ac', '1',               // 声道数: 1
        '-loglevel', 'error',     // 只显示错误
        'pipe:1'                  // 输出到 stdout
      ];

      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      let pcmBuffer = Buffer.alloc(0);
      let stderrData = '';

      ffmpegProcess.stdout.on('data', (chunk) => {
        pcmBuffer = Buffer.concat([pcmBuffer, chunk]);
      });

      ffmpegProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      ffmpegProcess.on('close', (code) => {
        if (code !== 0 && pcmBuffer.length === 0) {
          reject(new Error(`FFmpeg 解码失败 (code ${code}): ${stderrData}`));
        } else {
          resolve(pcmBuffer);
        }
      });

      ffmpegProcess.on('error', (err) => {
        reject(new Error(`FFmpeg 进程错误: ${err.message}`));
      });

      // 写入音频数据
      ffmpegProcess.stdin.write(audioData);
      ffmpegProcess.stdin.end();
    });
  }

  /**
   * 流式解码 WebM/Ogg 音频
   * 累积数据直到有完整的音频帧，然后解码
   */
  createStreamDecoder() {
    const chunks = [];
    let totalSize = 0;
    const maxBufferSize = 1024 * 1024; // 1MB 最大缓冲

    return {
      /**
       * 添加音频数据块
       * @param {Buffer} chunk - 音频数据块
       */
      addChunk(chunk) {
        chunks.push(chunk);
        totalSize += chunk.length;
        
        // 如果缓冲区过大，丢弃最旧的数据
        if (totalSize > maxBufferSize) {
          const overflow = totalSize - maxBufferSize;
          if (chunks[0] && chunks[0].length <= overflow) {
            totalSize -= chunks[0].length;
            chunks.shift();
          }
        }
      },

      /**
       * 获取所有累积的数据
       * @returns {Buffer} 合并后的音频数据
       */
      getBuffer() {
        return Buffer.concat(chunks);
      },

      /**
       * 解码所有累积的数据为 PCM
       * @returns {Promise<Buffer>} PCM 数据
       */
      async decode() {
        const buffer = this.getBuffer();
        if (buffer.length === 0) {
          return Buffer.alloc(0);
        }
        return this.decodeToPcm(buffer);
      },

      /**
       * 清空缓冲区
       */
      clear() {
        chunks.length = 0;
        totalSize = 0;
      },

      /**
       * 获取缓冲区大小
       */
      get size() {
        return totalSize;
      }
    };
  }
}

export default new WebmOpusDecoder();
