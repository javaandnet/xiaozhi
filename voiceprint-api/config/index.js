import { readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 版本号
export const VERSION = '1.0.0';

class Config {
    constructor() {
        this._config = this._loadConfig();
    }

    _loadConfig() {
        const configPath = join(process.cwd(), 'data', '.voiceprint.yaml');

        let config;
        try {
            const fileContent = readFileSync(configPath, 'utf8');
            config = yaml.load(fileContent);
        } catch (error) {
            console.error(`配置文件 data/.voiceprint.yaml 未找到，请先配置。`);
            throw new Error('请先配置 data/.voiceprint.yaml');
        }

        // 确保 server 配置存在
        if (!config.server) {
            config.server = {};
        }

        // 检查 authorization 字段
        let authorization = config.server.authorization;

        // 如果 authorization 为空或长度不足32位，生成新的 UUID
        if (!authorization || String(authorization).length < 32) {
            const newAuthorization = uuidv4().replace(/-/g, '');
            config.server.authorization = newAuthorization;

            // 更新配置文件
            try {
                writeFileSync(configPath, yaml.dump(config, { defaultFlowStyle: false, allowUnicode: true }), 'utf8');
                console.log(`已自动生成新的 authorization 密钥: ${newAuthorization}`);
                console.log('配置文件已更新，请妥善保管此密钥');
            } catch (err) {
                console.error('更新配置文件失败:', err);
            }
        }

        return config;
    }

    get server() {
        return this._config.server || {};
    }

    get mysql() {
        return this._config.mysql || {};
    }

    get voiceprint() {
        return this._config.voiceprint || {};
    }

    get logging() {
        return this._config.logging || {};
    }

    get apiToken() {
        return this.server.authorization || '';
    }

    get host() {
        return this.server.host || '0.0.0.0';
    }

    get port() {
        return this.server.port || 8005;
    }

    get similarityThreshold() {
        return this.voiceprint.similarity_threshold || 0.2;
    }

    get targetSampleRate() {
        return this.voiceprint.target_sample_rate || 16000;
    }

    get tmpDir() {
        return this.voiceprint.tmp_dir || 'tmp';
    }
}

// 全局配置实例
export const settings = new Config();
