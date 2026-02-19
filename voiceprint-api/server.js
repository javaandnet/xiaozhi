#!/usr/bin/env node

import { createServer } from 'http';
import { networkInterfaces } from 'os';
import { createApp } from './app.js';
import { settings } from './config/index.js';
import { getLogger } from './core/logger.js';
import { dbConnection } from './database/connection.js';

const logger = getLogger('server');

/**
 * 获取本机 IP 地址
 */
function getLocalIp() {
    try {
        const nets = networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                // 跳过内部地址和非 IPv4 地址
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return '127.0.0.1';
    } catch (error) {
        return '127.0.0.1';
    }
}

/**
 * 启动服务器
 */
async function startServer() {
    try {
        logger.start('开发环境服务启动');
        
        // 创建 Express 应用
        const app = await createApp();
        
        // 创建 HTTP 服务器
        const server = createServer(app);
        
        // 启动服务器
        server.listen(settings.port, settings.host, () => {
            const localIp = getLocalIp();
            
            logger.info('='.repeat(60));
            logger.info(`服务启动成功，监听地址: ${settings.host}:${settings.port}`);
            logger.info(`API文档: http://${settings.host}:${settings.port}/voiceprint/docs`);
            logger.info('='.repeat(60));
            logger.info(`声纹接口地址: http://${localIp}:${settings.port}/voiceprint/health?key=${settings.apiToken}`);
            logger.info('='.repeat(60));
        });

        // 优雅关闭
        process.on('SIGTERM', async () => {
            logger.info('收到 SIGTERM 信号，正在关闭服务...');
            server.close(async () => {
                await dbConnection.close();
                logger.info('服务已关闭');
                process.exit(0);
            });
        });

        process.on('SIGINT', async () => {
            logger.info('收到 SIGINT 信号，正在关闭服务...');
            server.close(async () => {
                await dbConnection.close();
                logger.info('服务已关闭');
                process.exit(0);
            });
        });

    } catch (error) {
        logger.fail(`服务启动失败: ${error.message}`);
        process.exit(1);
    }
}

// 启动服务器
startServer();
