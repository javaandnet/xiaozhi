import { Router } from 'express';
import healthRouter from './health.js';
import voiceprintRouter from './voiceprint.js';

const router = Router();

// 注册各个模块的路由
router.use(healthRouter);
router.use(voiceprintRouter);

export default router;
