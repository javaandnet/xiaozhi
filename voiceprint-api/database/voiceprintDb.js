import { getLogger } from '../core/logger.js';
import { dbConnection } from './connection.js';

const logger = getLogger('voiceprintDb');

class VoiceprintDB {
    /**
     * 保存或更新声纹特征
     * @param {string} speakerId - 说话人ID
     * @param {Buffer} embBuffer - 声纹特征向量 Buffer
     * @returns {Promise<boolean>} 操作是否成功
     */
    async saveVoiceprint(speakerId, embBuffer) {
        try {
            const sql = `
                INSERT INTO voiceprints (speaker_id, feature_vector)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE feature_vector=VALUES(feature_vector)
            `;
            await dbConnection.execute(sql, [speakerId, embBuffer]);
            logger.success(`声纹特征保存成功: ${speakerId}`);
            return true;
        } catch (error) {
            logger.fail(`保存声纹特征失败 ${speakerId}: ${error.message}`);
            return false;
        }
    }

    /**
     * 获取指定说话人ID的声纹特征
     * @param {Array<string>} speakerIds - 说话人ID列表
     * @returns {Promise<Object>} {speaker_id: Float32Array}
     */
    async getVoiceprints(speakerIds = null) {
        const startTime = Date.now();
        const queryType = speakerIds
            ? `指定ID查询(${speakerIds.length}个)`
            : '全量查询';
        logger.info(`开始数据库查询: ${queryType}`);

        try {
            let results;
            if (speakerIds && speakerIds.length > 0) {
                const placeholders = speakerIds.map(() => '?').join(',');
                const sql = `SELECT speaker_id, feature_vector FROM voiceprints WHERE speaker_id IN (${placeholders})`;
                results = await dbConnection.query(sql, speakerIds);
            } else {
                const sql = 'SELECT speaker_id, feature_vector FROM voiceprints';
                results = await dbConnection.query(sql);
            }

            const fetchTime = (Date.now() - startTime) / 1000;
            logger.info(`数据库查询完成，获取到${results.length}条记录，查询耗时: ${fetchTime.toFixed(3)}秒`);

            // 将数据库中的二进制特征转为 Float32Array
            const convertStart = Date.now();
            const voiceprints = {};
            for (const row of results) {
                // MySQL 返回的是 Buffer，需要转换为 Float32Array
                const buffer = Buffer.isBuffer(row.feature_vector)
                    ? row.feature_vector
                    : Buffer.from(row.feature_vector);
                voiceprints[row.speaker_id] = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
            }
            const convertTime = (Date.now() - convertStart) / 1000;
            logger.info(`数据转换完成，转换耗时: ${convertTime.toFixed(3)}秒`);

            const totalTime = (Date.now() - startTime) / 1000;
            logger.info(`获取到 ${Object.keys(voiceprints).length} 个声纹特征，总耗时: ${totalTime.toFixed(3)}秒`);
            return voiceprints;
        } catch (error) {
            const totalTime = (Date.now() - startTime) / 1000;
            logger.error(`获取声纹特征失败，总耗时: ${totalTime.toFixed(3)}秒，错误: ${error.message}`);
            return {};
        }
    }

    /**
     * 删除指定说话人的声纹特征
     * @param {string} speakerId - 说话人ID
     * @returns {Promise<boolean>} 操作是否成功
     */
    async deleteVoiceprint(speakerId) {
        try {
            const sql = 'DELETE FROM voiceprints WHERE speaker_id = ?';
            const result = await dbConnection.execute(sql, [speakerId]);

            if (result.affectedRows > 0) {
                logger.info(`声纹特征删除成功: ${speakerId}`);
                return true;
            } else {
                logger.warning(`未找到要删除的声纹特征: ${speakerId}`);
                return false;
            }
        } catch (error) {
            logger.error(`删除声纹特征失败 ${speakerId}: ${error.message}`);
            return false;
        }
    }

    /**
     * 获取声纹特征总数
     * @returns {Promise<number>} 声纹特征总数
     */
    async countVoiceprints() {
        const startTime = Date.now();
        logger.info('开始查询声纹特征总数...');

        try {
            const sql = 'SELECT COUNT(*) as count FROM voiceprints';
            const results = await dbConnection.query(sql);
            const count = results[0]?.count || 0;

            const totalTime = (Date.now() - startTime) / 1000;
            logger.info(`声纹特征总数查询完成: ${count}，耗时: ${totalTime.toFixed(3)}秒`);
            return count;
        } catch (error) {
            const totalTime = (Date.now() - startTime) / 1000;
            logger.error(`获取声纹特征总数失败，总耗时: ${totalTime.toFixed(3)}秒，错误: ${error.message}`);
            return 0;
        }
    }
}

// 全局声纹数据库操作实例
export const voiceprintDb = new VoiceprintDB();
