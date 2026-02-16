// 核心配置文件

module.exports = {
  // 服务器配置
  server: {
    port: process.env.PORT || 9999,
    http_port: process.env.HTTP_PORT || 9999,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
    auth_key: process.env.AUTH_KEY || 'xiaozhi-auth-secret-key',
    // MQTT网关配置（可选）
    mqtt_gateway: process.env.MQTT_GATEWAY || '',
    mqtt_signature_key: process.env.MQTT_SIGNATURE_KEY || '',
    // 认证配置
    auth: {
      enabled: process.env.AUTH_ENABLED === 'true' || false,
      expire_seconds: process.env.AUTH_EXPIRE_SECONDS || 2592000, // 30天
      allowed_devices: process.env.ALLOWED_DEVICES ? process.env.ALLOWED_DEVICES.split(',') : []
    }
  },

  // WebSocket配置
  websocket: {
    heartbeatInterval: 30000,
    timeout: 60000,
    maxPayload: 1024 * 1024 // 1MB
  },

  // 音频配置
  audio: {
    format: 'opus',
    sampleRate: 16000,
    channels: 1,
    frameDuration: 60,
    bitRate: 24000
  },

  // 会话配置
  session: {
    timeout: 300000, // 5分钟
    maxSessions: 1000
  },

  // 设备配置
  device: {
    maxDevices: 10000,
    heartbeatTimeout: 120000 // 2分钟
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/server.log',
    maxSize: '50m',
    maxFiles: 5
  },

  // 安全配置
  security: {
    jwtSecret: process.env.JWT_SECRET || 'xiaozhi-secret-key',
    apiKey: process.env.API_KEY || '',
    cors: {
      origin: '*',
      credentials: true
    }
  },

  // 服务配置
  services: {
    // TTS服务配置
    tts: {
      provider: process.env.TTS_PROVIDER || 'edge',
      voice: process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural'
    },

    // STT服务配置
    stt: {
      provider: process.env.STT_PROVIDER || 'funasr',
      language: process.env.STT_LANGUAGE || 'zh-CN'
    },

    // LLM服务配置
    llm: {
      provider: process.env.LLM_PROVIDER || 'glm', // openai, qwen, glm, deepseek
      model: process.env.LLM_MODEL || 'glm-4-flash',
      api_key: process.env.LLM_API_KEY || '60284c17c64043f290fab4b0ce20ec1c.2ocJCaVIXzpGbch3',
      base_url: process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.7,
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS) || 500
    },

    // VAD配置
    vad: {
      threshold: 0.5,
      minSpeechDuration: 300,
      maxSpeechDuration: 30000
    },

    // 唤醒词检测配置
    wakeword: {
      keywords: ['小智', '你好小智', 'Hey XiaoZhi'],
      sensitivity: 0.7,
      minConfidence: 0.6,
      language: 'zh-CN',
      enable: true
    }
  }
};