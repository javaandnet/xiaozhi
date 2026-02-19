import { Router } from 'express';
import Busboy from 'busboy';
import { voiceprintService } from '../services/voiceprintService.js';
import { authMiddleware } from '../core/security.js';
import { getLogger } from '../core/logger.js';

const logger = getLogger('voiceprint');
const router = Router();

/**
 * 解析 multipart/form-data 请求
 * @param {Request} req - Express 请求对象
 * @returns {Promise<{fields: Object, files: Object}>}
 */
function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024 } });
        const fields = {};
        const files = {};

        busboy.on('field', (name, value) => {
            fields[name] = value;
        });

        busboy.on('file', (name, file, info) => {
            const { filename, mimeType } = info;
            const chunks = [];

            file.on('data', (chunk) => {
                chunks.push(chunk);
            });

            file.on('end', () => {
                const buffer = Buffer.concat(chunks);
                files[name] = {
                    buffer,
                    originalname: filename,
                    mimetype: mimeType,
                    size: buffer.length,
                };
            });

            file.on('limit', () => {
                reject(new Error('文件大小超过限制 (10MB)'));
            });
        });

        busboy.on('finish', () => {
            resolve({ fields, files });
        });

        busboy.on('error', (error) => {
            reject(error);
        });

        req.pipe(busboy);
    });
}

/**
 * @route POST /voiceprint/register
 * @desc 声纹注册
 * @access Private
 */
router.post('/register', authMiddleware, async (req, res, next) => {
    try {
        const { fields, files } = await parseMultipart(req);
        const speaker_id = fields.speaker_id;
        const file = files.file;

        if (!speaker_id) {
            return res.status(400).json({ detail: '缺少 speaker_id 参数' });
        }

        if (!file) {
            return res.status(400).json({ detail: '缺少音频文件' });
        }

        // 验证文件类型
        if (!file.originalname.toLowerCase().endsWith('.wav')) {
            return res.status(400).json({ detail: '只支持 WAV 格式音频文件' });
        }

        // 读取音频数据
        const audioBytes = file.buffer;

        // 注册声纹
        const success = await voiceprintService.registerVoiceprint(speaker_id, audioBytes);

        if (success) {
            res.json({ success: true, msg: `已登记: ${speaker_id}` });
        } else {
            res.status(500).json({ detail: '声纹注册失败' });
        }
    } catch (error) {
        logger.fail(`声纹注册异常: ${error.message}`);
        next(error);
    }
});

/**
 * @route POST /voiceprint/identify
 * @desc 声纹识别
 * @access Private
 */
router.post('/identify', authMiddleware, async (req, res, next) => {
    const startTime = Date.now();

    try {
        const { fields, files } = await parseMultipart(req);
        const speaker_ids = fields.speaker_ids;
        const file = files.file;

        logger.info(`开始声纹识别请求 - 候选说话人: ${speaker_ids}, 文件: ${file?.originalname}`);

        // 验证文件类型
        const validationStart = Date.now();
        if (!file || !file.originalname.toLowerCase().endsWith('.wav')) {
            return res.status(400).json({ detail: '只支持 WAV 格式音频文件' });
        }
        const validationTime = (Date.now() - validationStart) / 1000;
        logger.info(`文件类型验证完成，耗时: ${validationTime.toFixed(3)}秒`);

        // 解析候选说话人ID
        const parseStart = Date.now();
        const candidateIds = speaker_ids
            ? speaker_ids.split(',').map(id => id.trim()).filter(id => id)
            : [];
        
        if (candidateIds.length === 0) {
            return res.status(400).json({ detail: '候选说话人ID不能为空' });
        }
        const parseTime = (Date.now() - parseStart) / 1000;
        logger.info(`候选说话人ID解析完成，共${candidateIds.length}个，耗时: ${parseTime.toFixed(3)}秒`);

        // 读取音频数据
        const readStart = Date.now();
        const audioBytes = file.buffer;
        const readTime = (Date.now() - readStart) / 1000;
        logger.info(`音频文件读取完成，大小: ${audioBytes.length}字节，耗时: ${readTime.toFixed(3)}秒`);

        // 识别声纹
        const identifyStart = Date.now();
        logger.info('开始调用声纹识别服务...');
        const [matchName, matchScore] = await voiceprintService.identifyVoiceprint(candidateIds, audioBytes);
        const identifyTime = (Date.now() - identifyStart) / 1000;
        logger.info(`声纹识别服务调用完成，耗时: ${identifyTime.toFixed(3)}秒`);

        const totalTime = (Date.now() - startTime) / 1000;
        logger.info(`声纹识别请求完成，总耗时: ${totalTime.toFixed(3)}秒，识别结果: ${matchName}, 分数: ${matchScore.toFixed(4)}`);

        res.json({ speaker_id: matchName, score: matchScore });

    } catch (error) {
        const totalTime = (Date.now() - startTime) / 1000;
        logger.error(`声纹识别异常，总耗时: ${totalTime.toFixed(3)}秒，错误: ${error.message}`);
        next(error);
    }
});

/**
 * @route DELETE /voiceprint/:speaker_id
 * @desc 删除声纹
 * @access Private
 */
router.delete('/:speaker_id', authMiddleware, async (req, res, next) => {
    try {
        const { speaker_id } = req.params;

        const success = await voiceprintService.deleteVoiceprint(speaker_id);

        if (success) {
            res.json({ success: true, msg: `已删除: ${speaker_id}` });
        } else {
            res.status(404).json({ detail: `未找到说话人: ${speaker_id}` });
        }
    } catch (error) {
        logger.error(`删除声纹异常 ${req.params.speaker_id}: ${error.message}`);
        next(error);
    }
});

export default router;

