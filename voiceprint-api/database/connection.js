import mysql from 'mysql2/promise';
import { settings } from '../config/index.js';
import { getLogger } from '../core/logger.js';

const logger = getLogger('database');

class DatabaseConnection {
    constructor() {
        this._pool = null;
        this._connect();
    }

    async _connect() {
        try {
            const mysqlConfig = settings.mysql;
            
            this._pool = mysql.createPool({
                host: mysqlConfig.host,
                port: mysqlConfig.port || 3306,
                user: mysqlConfig.user,
                password: mysqlConfig.password || '',
                database: mysqlConfig.database,
                charset: 'utf8mb4',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 10000,
            });

            // 测试连接
            const connection = await this._pool.getConnection();
            await connection.ping();
            connection.release();

            logger.success('数据库连接成功');
        } catch (error) {
            logger.fail(`数据库连接失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取数据库连接
     * @returns {Promise<mysql.PoolConnection>}
     */
    async getConnection() {
        if (!this._pool) {
            await this._connect();
        }
        return await this._pool.getConnection();
    }

    /**
     * 执行 SQL 查询
     * @param {string} sql - SQL 语句
     * @param {Array} params - 查询参数
     * @returns {Promise<Array>}
     */
    async query(sql, params = []) {
        const connection = await this.getConnection();
        try {
            const [results] = await connection.execute(sql, params);
            return results;
        } finally {
            connection.release();
        }
    }

    /**
     * 执行 SQL 语句（INSERT/UPDATE/DELETE）
     * @param {string} sql - SQL 语句
     * @param {Array} params - 查询参数
     * @returns {Promise<mysql.ResultSetHeader>}
     */
    async execute(sql, params = []) {
        const connection = await this.getConnection();
        try {
            const [result] = await connection.execute(sql, params);
            return result;
        } finally {
            connection.release();
        }
    }

    /**
     * 关闭数据库连接池
     */
    async close() {
        if (this._pool) {
            await this._pool.end();
            logger.info('数据库连接已关闭');
        }
    }
}

// 全局数据库连接实例
export const dbConnection = new DatabaseConnection();
