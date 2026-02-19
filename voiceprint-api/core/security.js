import { settings } from '../config/index.js';
import { getLogger } from './logger.js';

const logger = getLogger('security');

/**
 * 验证 API 访问令牌
 * @param {string} authorization - 请求头中的授权令牌
 * @returns {boolean} 验证是否通过
 * @throws {Error} 令牌无效时抛出 401 错误
 */
export function verifyToken(authorization) {
    const expectedToken = settings.apiToken;

    if (authorization !== expectedToken) {
        logger.warning(`无效的接口令牌: ${authorization ? authorization.substring(0, 20) : 'empty'}...`);
        const error = new Error('无效的接口令牌');
        error.statusCode = 401;
        throw error;
    }

    return true;
}

/**
 * Express 中间件：验证令牌
 */
export function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            const error = new Error('缺少授权令牌');
            error.statusCode = 401;
            throw error;
        }

        // 支持 Bearer token 格式
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;

        verifyToken(token);
        next();
    } catch (error) {
        next(error);
    }
}
