import { Router } from 'express';
import { voiceprintService } from '../services/voiceprintService.js';
import { settings } from '../config/index.js';
import { getLogger } from '../core/logger.js';

const logger = getLogger('health');
const router = Router();

/**
 * @route GET /voiceprint/health
 * @desc 健康检查
 * @access Private (需要密钥)
 */
router.get('/health', async (req, res, next) => {
    const startTime = Date.now();
    logger.start('健康检查请求');

    try {
        const { key } = req.query;

        // 验证密钥
        const keyCheckStart = Date.now();
        if (key !== settings.apiToken) {
            logger.warning(`健康检查接口收到无效密钥: ${key}`);
            return res.status(401).json({ detail: '密钥验证失败' });
        }
        const keyCheckTime = (Date.now() - keyCheckStart) / 1000;
        logger.info(`密钥验证完成，耗时: ${keyCheckTime.toFixed(3)}秒`);

        // 获取声纹统计信息
        const countStart = Date.now();
        logger.info('开始获取声纹统计信息...');
        const count = await voiceprintService.getVoiceprintCount();
        const countTime = (Date.now() - countStart) / 1000;
        logger.info(`声纹统计信息获取完成，总数: ${count}，耗时: ${countTime.toFixed(3)}秒`);

        const totalTime = (Date.now() - startTime) / 1000;
        logger.complete('健康检查请求', totalTime);

        res.json({ total_voiceprints: count, status: 'healthy' });
    } catch (error) {
        const totalTime = (Date.now() - startTime) / 1000;
        logger.fail(`获取统计信息异常，总耗时: ${totalTime.toFixed(3)}秒，错误: ${error.message}`);
        next(error);
    }
});

export default router;
