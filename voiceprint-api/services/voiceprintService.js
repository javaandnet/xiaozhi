import { settings } from '../config/index.js';
import { getLogger } from '../core/logger.js';
import { voiceprintDb } from '../database/voiceprintDb.js';
import { audioProcessor } from '../utils/audioUtils.js';
import { spawn } from 'child_process';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const logger = getLogger('voiceprintService');

class VoiceprintService {
    constructor() {
        this.similarityThreshold = settings.similarityThreshold;
        this.targetSampleRate = settings.targetSampleRate;
        this.initialized = false;
    }

    /**
     * 初始化声纹服务
     */
    async initialize() {
        if (this.initialized) return;
        
        logger.start('初始化声纹识别服务');
        const startTime = Date.now();

        try {
            // 检查 Python 和必要的库是否可用
            await this._checkPythonEnvironment();
            
            this.initialized = true;
            const initTime = (Date.now() - startTime) / 1000;
            logger.complete('初始化声纹识别服务', initTime);
        } catch (error) {
            logger.fail(`声纹服务初始化失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 检查 Python 环境
     */
    async _checkPythonEnvironment() {
        return new Promise((resolve, reject) => {
            const python = spawn('python3', ['-c', `
import sys
try:
    import numpy as np
    import torch
    from modelscope.pipelines import pipeline
    from modelscope.utils.constant import Tasks
    print("OK")
except ImportError as e:
    print(f"MISSING:{e}")
    sys.exit(1)
            `]);

            let output = '';
            let errorOutput = '';

            python.stdout.on('data', (data) => {
                output += data.toString();
            });

            python.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            python.on('close', (code) => {
                if (code === 0 && output.includes('OK')) {
                    resolve();
                } else {
                    reject(new Error(`Python 环境检查失败: ${errorOutput || output}`));
                }
            });
        });
    }

    /**
     * 提取声纹特征
     * @param {string} audioPath - 音频文件路径
     * @returns {Promise<Float32Array>} 声纹特征向量
     */
    async extractVoiceprint(audioPath) {
        const startTime = Date.now();
        logger.start(`提取声纹特征，音频文件: ${audioPath}`);

        try {
            const embedding = await this._callPythonExtractor(audioPath);
            
            const totalTime = (Date.now() - startTime) / 1000;
            logger.complete(`提取声纹特征，维度: ${embedding.length}`, totalTime);
            
            return embedding;
        } catch (error) {
            const totalTime = (Date.now() - startTime) / 1000;
            logger.fail(`声纹特征提取失败，总耗时: ${totalTime.toFixed(3)}秒，错误: ${error.message}`);
            throw error;
        }
    }

    /**
     * 调用 Python 提取声纹特征
     * @param {string} audioPath - 音频文件路径
     * @returns {Promise<Float32Array>} 声纹特征向量
     */
    async _callPythonExtractor(audioPath) {
        return new Promise((resolve, reject) => {
            const pythonScript = `
import sys
import json
import numpy as np
import torch
from modelscope.pipelines import pipeline
from modelscope.utils.constant import Tasks

try:
    # 初始化模型（如果尚未初始化）
    if not hasattr(sys, '_voiceprint_model'):
        device = "cuda" if torch.cuda.is_available() else "cpu"
        sys._voiceprint_model = pipeline(
            task=Tasks.speaker_verification,
            model="iic/speech_campplus_sv_zh-cn_3dspeaker_16k",
            device=device,
        )
    
    audio_path = sys.argv[1]
    result = sys._voiceprint_model([audio_path], output_emb=True)
    emb = result["embs"][0]
    
    # 转换为 numpy 并输出
    if torch.is_tensor(emb):
        emb = emb.cpu().numpy()
    else:
        emb = np.asarray(emb)
    
    emb = emb.astype(np.float32)
    
    # 输出为 JSON
    print(json.dumps(emb.tolist()))
    
except Exception as e:
    print(f"ERROR:{e}", file=sys.stderr)
    sys.exit(1)
            `;

            const python = spawn('python3', ['-c', pythonScript, audioPath]);

            let output = '';
            let errorOutput = '';

            python.stdout.on('data', (data) => {
                output += data.toString();
            });

            python.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            python.on('close', (code) => {
                if (code === 0) {
                    try {
                        const embedding = JSON.parse(output.trim());
                        resolve(new Float32Array(embedding));
                    } catch (e) {
                        reject(new Error(`解析声纹特征失败: ${e.message}`));
                    }
                } else {
                    reject(new Error(`Python 提取失败: ${errorOutput || output}`));
                }
            });
        });
    }

    /**
     * 计算两个声纹特征的相似度
     * @param {Float32Array} emb1 - 声纹特征1
     * @param {Float32Array} emb2 - 声纹特征2
     * @returns {number} 相似度分数 (0-1)
     */
    calculateSimilarity(emb1, emb2) {
        try {
            // 使用余弦相似度
            let dotProduct = 0;
            let norm1 = 0;
            let norm2 = 0;

            for (let i = 0; i < emb1.length; i++) {
                dotProduct += emb1[i] * emb2[i];
                norm1 += emb1[i] * emb1[i];
                norm2 += emb2[i] * emb2[i];
            }

            norm1 = Math.sqrt(norm1);
            norm2 = Math.sqrt(norm2);

            if (norm1 === 0 || norm2 === 0) {
                return 0.0;
            }

            return dotProduct / (norm1 * norm2);
        } catch (error) {
            logger.error(`相似度计算失败: ${error.message}`);
            return 0.0;
        }
    }

    /**
     * 注册声纹
     * @param {string} speakerId - 说话人ID
     * @param {Buffer} audioBytes - 音频字节数据
     * @returns {Promise<boolean>} 注册是否成功
     */
    async registerVoiceprint(speakerId, audioBytes) {
        let audioPath = null;
        
        try {
            // 简化音频验证，只做基本检查
            if (audioBytes.length < 1000) {
                logger.warning(`音频文件过小: ${speakerId}`);
                return false;
            }

            // 处理音频文件
            audioPath = await audioProcessor.ensure16kWav(audioBytes);

            // 提取声纹特征
            const emb = await this.extractVoiceprint(audioPath);

            // 转换为 Buffer 存储
            const embBuffer = Buffer.from(emb.buffer);

            // 保存到数据库
            const success = await voiceprintDb.saveVoiceprint(speakerId, embBuffer);

            if (success) {
                logger.info(`声纹注册成功: ${speakerId}`);
            } else {
                logger.error(`声纹注册失败: ${speakerId}`);
            }

            return success;

        } catch (error) {
            logger.error(`声纹注册异常 ${speakerId}: ${error.message}`);
            return false;
        } finally {
            // 清理临时文件
            if (audioPath) {
                audioProcessor.cleanupTempFile(audioPath);
            }
        }
    }

    /**
     * 识别声纹
     * @param {Array<string>} speakerIds - 候选说话人ID列表
     * @param {Buffer} audioBytes - 音频字节数据
     * @returns {Promise<[string, number]>} [识别出的说话人ID, 相似度分数]
     */
    async identifyVoiceprint(speakerIds, audioBytes) {
        const startTime = Date.now();
        logger.info(`开始声纹识别流程，候选说话人数量: ${speakerIds.length}`);

        let audioPath = null;
        
        try {
            // 简化音频验证
            if (audioBytes.length < 1000) {
                logger.warning('音频文件过小');
                return ['', 0.0];
            }

            // 处理音频文件
            const audioProcessStart = Date.now();
            audioPath = await audioProcessor.ensure16kWav(audioBytes);
            const audioProcessTime = (Date.now() - audioProcessStart) / 1000;
            logger.debug(`音频文件处理完成，耗时: ${audioProcessTime.toFixed(3)}秒`);

            // 提取声纹特征
            const extractStart = Date.now();
            logger.debug('开始提取声纹特征...');
            const testEmb = await this.extractVoiceprint(audioPath);
            const extractTime = (Date.now() - extractStart) / 1000;
            logger.debug(`声纹特征提取完成，耗时: ${extractTime.toFixed(3)}秒`);

            // 获取候选声纹特征
            const dbQueryStart = Date.now();
            logger.debug('开始查询数据库获取候选声纹特征...');
            const voiceprints = await voiceprintDb.getVoiceprints(speakerIds);
            const dbQueryTime = (Date.now() - dbQueryStart) / 1000;
            logger.debug(`数据库查询完成，获取到${Object.keys(voiceprints).length}个声纹特征，耗时: ${dbQueryTime.toFixed(3)}秒`);

            if (Object.keys(voiceprints).length === 0) {
                logger.info('未找到候选说话人声纹');
                return ['', 0.0];
            }

            // 计算相似度
            const similarityStart = Date.now();
            logger.debug('开始计算相似度...');
            const similarities = {};
            for (const [name, emb] of Object.entries(voiceprints)) {
                const similarity = this.calculateSimilarity(testEmb, emb);
                similarities[name] = similarity;
            }
            const similarityTime = (Date.now() - similarityStart) / 1000;
            logger.debug(`相似度计算完成，共计算${Object.keys(similarities).length}个，耗时: ${similarityTime.toFixed(3)}秒`);

            // 找到最佳匹配
            if (Object.keys(similarities).length === 0) {
                return ['', 0.0];
            }

            const matchName = Object.keys(similarities).reduce((a, b) => 
                similarities[a] > similarities[b] ? a : b
            );
            const matchScore = similarities[matchName];

            // 检查是否超过阈值
            if (matchScore < this.similarityThreshold) {
                logger.info(`未识别到说话人，最高分: ${matchScore.toFixed(4)}，阈值: ${this.similarityThreshold}`);
                const totalTime = (Date.now() - startTime) / 1000;
                logger.info(`声纹识别流程完成，总耗时: ${totalTime.toFixed(3)}秒`);
                return ['', matchScore];
            }

            const totalTime = (Date.now() - startTime) / 1000;
            logger.info(`识别到说话人: ${matchName}, 分数: ${matchScore.toFixed(4)}, 总耗时: ${totalTime.toFixed(3)}秒`);
            return [matchName, matchScore];

        } catch (error) {
            const totalTime = (Date.now() - startTime) / 1000;
            logger.error(`声纹识别异常，总耗时: ${totalTime.toFixed(3)}秒，错误: ${error.message}`);
            return ['', 0.0];
        } finally {
            // 清理临时文件
            const cleanupStart = Date.now();
            if (audioPath) {
                audioProcessor.cleanupTempFile(audioPath);
            }
            const cleanupTime = (Date.now() - cleanupStart) / 1000;
            logger.debug(`临时文件清理完成，耗时: ${cleanupTime.toFixed(3)}秒`);
        }
    }

    /**
     * 删除声纹
     * @param {string} speakerId - 说话人ID
     * @returns {Promise<boolean>} 删除是否成功
     */
    async deleteVoiceprint(speakerId) {
        return await voiceprintDb.deleteVoiceprint(speakerId);
    }

    /**
     * 获取声纹总数
     * @returns {Promise<number>} 声纹总数
     */
    async getVoiceprintCount() {
        const startTime = Date.now();
        logger.info('开始获取声纹总数...');

        try {
            const count = await voiceprintDb.countVoiceprints();
            const totalTime = (Date.now() - startTime) / 1000;
            logger.info(`声纹总数获取完成: ${count}，耗时: ${totalTime.toFixed(3)}秒`);
            return count;
        } catch (error) {
            const totalTime = (Date.now() - startTime) / 1000;
            logger.error(`获取声纹总数失败，总耗时: ${totalTime.toFixed(3)}秒，错误: ${error.message}`);
            throw error;
        }
    }
}

// 全局声纹服务实例
export const voiceprintService = new VoiceprintService();
