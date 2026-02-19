import { join } from 'path';
import winston from 'winston';
import { settings, VERSION } from '../config/index.js';

// 确保日志目录存在
import { mkdirSync } from 'fs';
const logDir = join(process.cwd(), 'voiceprint-api', 'logs');
try {
    mkdirSync(logDir, { recursive: true });
} catch (err) {
    // 目录已存在
}

// 自定义日志格式
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYMMDD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        const name = metadata.name || 'app';
        return `${timestamp} [${VERSION}][${name}]-${level}- ${message}`;
    })
);

const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYMMDD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        const name = metadata.name || 'app';
        return `${timestamp}[${VERSION}][${name}]-${level}-${message}`;
    })
);

// 创建 Winston 日志实例
const winstonLogger = winston.createLogger({
    level: settings.logging.level || 'info',
    transports: [
        // 控制台输出
        new winston.transports.Console({
            format: consoleFormat
        }),
        // 文件输出
        new winston.transports.File({
            filename: join(logDir, 'voiceprint_api.log'),
            format: fileFormat,
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 7,
        })
    ]
});

class Logger {
    constructor(name) {
        this._name = name;
    }

    _log(level, message, meta = {}) {
        winstonLogger.log(level, message, { name: this._name, ...meta });
    }

    debug(message, ...args) {
        this._log('debug', message, { args });
    }

    info(message, ...args) {
        this._log('info', message, { args });
    }

    warning(message, ...args) {
        this._log('warn', message, { args });
    }

    warn(message, ...args) {
        this._log('warn', message, { args });
    }

    error(message, ...args) {
        this._log('error', message, { args });
    }

    critical(message, ...args) {
        this._log('error', `CRITICAL: ${message}`, { args });
    }

    success(message, ...args) {
        this._log('info', `✅ ${message}`, { args });
    }

    fail(message, ...args) {
        this._log('error', `❌ ${message}`, { args });
    }

    start(operation, ...args) {
        this._log('info', `🚀 开始: ${operation}`, { args });
    }

    complete(operation, duration = null, ...args) {
        if (duration !== null) {
            this._log('info', `✅ 完成: ${operation} (耗时: ${duration.toFixed(3)}秒)`, { args });
        } else {
            this._log('info', `✅ 完成: ${operation}`, { args });
        }
    }

    initComponent(componentName, status = '成功', ...args) {
        if (status.toLowerCase() === '成功' || status.toLowerCase() === 'success' || status.toLowerCase() === 'ok') {
            this._log('info', `🔧 初始化组件: ${componentName} ${status}`, { args });
        } else {
            this._log('error', `🔧 初始化组件: ${componentName} ${status}`, { args });
        }
    }
}

// 获取日志记录器
export function getLogger(name) {
    return new Logger(name);
}

// 便捷函数
export function logSuccess(message, loggerName = 'app') {
    getLogger(loggerName).success(message);
}

export function logFail(message, loggerName = 'app') {
    getLogger(loggerName).fail(message);
}

export function logStart(operation, loggerName = 'app') {
    getLogger(loggerName).start(operation);
}

export function logComplete(operation, duration = null, loggerName = 'app') {
    getLogger(loggerName).complete(operation, duration);
}

export function logInitComponent(componentName, status = '成功', loggerName = 'app') {
    getLogger(loggerName).initComponent(componentName, status);
}

export default winstonLogger;
