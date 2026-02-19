import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';
import { settings } from '../config/index.js';
import { getLogger } from '../core/logger.js';

const logger = getLogger('audioUtils');

class AudioProcessor {
    constructor() {
        this.targetSampleRate = settings.targetSampleRate;
        this.tmpDir = join(process.cwd(), 'voiceprint-api', settings.tmpDir || 'tmp');
        
        // 确保临时目录存在
        try {
            mkdirSync(this.tmpDir, { recursive: true });
        } catch (err) {
            // 目录已存在
        }
    }

    /**
     * 生成临时文件路径
     * @param {string} extension - 文件扩展名
     * @returns {string} 临时文件路径
     */
    _getTempPath(extension = '.wav') {
        const randomName = randomBytes(16).toString('hex');
        return join(this.tmpDir, `${randomName}${extension}`);
    }

    /**
     * 将任意采样率的 wav bytes 转为 16kHz wav 临时文件
     * @param {Buffer} audioBytes - 音频字节数据
     * @returns {Promise<string>} 临时文件路径
     */
    async ensure16kWav(audioBytes) {
        const startTime = Date.now();
        logger.debug(`开始音频处理，输入大小: ${audioBytes.length}字节`);

        const tempPath = this._getTempPath('.wav');
        
        try {
            // 写入临时文件
            writeFileSync(tempPath, audioBytes);

            // 使用 ffprobe 获取音频信息
            let sampleRate;
            try {
                const probeResult = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`, {
                    encoding: 'utf8',
                    timeout: 5000
                });
                sampleRate = parseInt(probeResult.trim(), 10);
            } catch (err) {
                throw new Error(`无法读取音频文件信息: ${err.message}`);
            }

            const readTime = (Date.now() - startTime) / 1000;
            logger.debug(`音频文件信息获取完成，采样率: ${sampleRate}Hz，耗时: ${readTime.toFixed(3)}秒`);

            // 如果不是 16kHz，需要重采样
            if (sampleRate !== this.targetSampleRate) {
                const resampleStart = Date.now();
                logger.debug(`开始音频重采样: ${sampleRate}Hz -> ${this.targetSampleRate}Hz`);

                const resampledPath = this._getTempPath('_16k.wav');
                
                // 使用 ffmpeg 进行重采样
                execSync(`ffmpeg -y -i "${tempPath}" -ar ${this.targetSampleRate} -ac 1 -c:a pcm_s16le "${resampledPath}"`, {
                    timeout: 30000,
                    stdio: 'pipe'
                });

                // 删除原始临时文件
                this.cleanupTempFile(tempPath);

                const resampleTime = (Date.now() - resampleStart) / 1000;
                logger.debug(`音频重采样完成，耗时: ${resampleTime.toFixed(3)}秒`);

                const totalTime = (Date.now() - startTime) / 1000;
                logger.debug(`音频处理完成，总耗时: ${totalTime.toFixed(3)}秒`);
                
                return resampledPath;
            }

            const totalTime = (Date.now() - startTime) / 1000;
            logger.debug(`音频处理完成（无需重采样），总耗时: ${totalTime.toFixed(3)}秒`);
            
            return tempPath;

        } catch (error) {
            // 清理临时文件
            this.cleanupTempFile(tempPath);
            const totalTime = (Date.now() - startTime) / 1000;
            logger.error(`音频处理失败，总耗时: ${totalTime.toFixed(3)}秒，错误: ${error.message}`);
            throw error;
        }
    }

    /**
     * 验证音频文件格式是否有效
     * @param {Buffer} audioBytes - 音频字节数据
     * @returns {Promise<boolean>} 音频文件是否有效
     */
    async validateAudioFile(audioBytes) {
        const startTime = Date.now();
        logger.debug(`开始音频文件验证，输入大小: ${audioBytes.length}字节`);

        const tempPath = this._getTempPath('.wav');

        try {
            writeFileSync(tempPath, audioBytes);

            // 使用 ffprobe 获取音频信息
            let sampleRate, duration;
            try {
                const probeResult = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate,duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`, {
                    encoding: 'utf8',
                    timeout: 5000
                });
                const lines = probeResult.trim().split('\n');
                sampleRate = parseInt(lines[0], 10);
                duration = parseFloat(lines[1]);
            } catch (err) {
                logger.warning(`无法读取音频文件信息: ${err.message}`);
                return false;
            }

            const readTime = (Date.now() - startTime) / 1000;
            logger.debug(`音频文件读取完成，采样率: ${sampleRate}Hz，时长: ${duration}秒，耗时: ${readTime.toFixed(3)}秒`);

            // 检查音频数据
            if (!duration || duration === 0) {
                logger.warning('音频文件为空');
                return false;
            }

            // 检查采样率
            if (sampleRate < 8000) {
                logger.warning(`采样率过低: ${sampleRate}Hz`);
                return false;
            }

            // 检查音频时长（至少0.5秒，最多30秒）
            if (duration < 0.5) {
                logger.warning(`音频时长过短: ${duration.toFixed(2)}秒`);
                return false;
            } else if (duration > 30) {
                logger.warning(`音频时长过长: ${duration.toFixed(2)}秒`);
                return false;
            }

            const totalTime = (Date.now() - startTime) / 1000;
            logger.debug(`音频验证通过: ${duration.toFixed(2)}秒, ${sampleRate}Hz，总耗时: ${totalTime.toFixed(3)}秒`);
            return true;

        } catch (error) {
            const totalTime = (Date.now() - startTime) / 1000;
            logger.error(`音频文件验证失败，总耗时: ${totalTime.toFixed(3)}秒，错误: ${error.message}`);
            return false;
        } finally {
            this.cleanupTempFile(tempPath);
        }
    }

    /**
     * 清理临时文件
     * @param {string} filePath - 临时文件路径
     */
    cleanupTempFile(filePath) {
        try {
            if (filePath && existsSync(filePath)) {
                unlinkSync(filePath);
                logger.debug(`临时文件已清理: ${filePath}`);
            }
        } catch (error) {
            logger.debug(`清理临时文件失败 ${filePath}: ${error.message}`);
        }
    }

    /**
     * 读取音频文件为 Float32Array（用于模型推理）
     * @param {string} audioPath - 音频文件路径
     * @returns {Float32Array} 音频数据
     */
    readAudioAsFloat32(audioPath) {
        try {
            // 使用 ffmpeg 将音频转换为原始 PCM 数据
            const pcmBuffer = execSync(`ffmpeg -y -i "${audioPath}" -ar ${this.targetSampleRate} -ac 1 -f f32le -`, {
                timeout: 30000,
                maxBuffer: 50 * 1024 * 1024 // 50MB buffer
            });

            // 将 Buffer 转换为 Float32Array
            return new Float32Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 4);
        } catch (error) {
            logger.error(`读取音频文件失败: ${error.message}`);
            throw error;
        }
    }
}

// 全局音频处理器实例
export const audioProcessor = new AudioProcessor();
