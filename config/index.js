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
      language: process.env.STT_LANGUAGE || 'zh-CN',
      sampleRate: parseInt(process.env.STT_SAMPLE_RATE) || 16000,
      channels: parseInt(process.env.STT_CHANNELS) || 1,
      frameDuration: parseInt(process.env.STT_FRAME_DURATION) || 60,
      maxBufferSize: parseInt(process.env.STT_MAX_BUFFER_SIZE) || 100,
      vadEnabled: process.env.STT_VAD_ENABLED !== 'false',
      vadThreshold: parseFloat(process.env.STT_VAD_THRESHOLD) || 0.5,
      enableWakeWordDetection: process.env.STT_WAKE_WORD_ENABLED === 'true',
      wakeWords: (process.env.STT_WAKE_WORDS || '小智,你好小智').split(','),
      outputDir: process.env.STT_OUTPUT_DIR || 'tmp/',
      deleteAudioFile: process.env.STT_DELETE_AUDIO_FILE !== 'false',

      // 火山引擎豆包ASR配置
      doubao: {
        appid: process.env.DOUBAO_ASR_APPID,
        cluster: process.env.DOUBAO_ASR_CLUSTER,
        access_token: process.env.DOUBAO_ASR_ACCESS_TOKEN,
        wsUrl: process.env.DOUBAO_ASR_WS_URL || 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
        uid: process.env.DOUBAO_ASR_UID || 'streaming_asr_service',
        workflow: process.env.DOUBAO_ASR_WORKFLOW || 'audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate',
        resultType: process.env.DOUBAO_ASR_RESULT_TYPE || 'single',
        enableMultilingual: process.env.DOUBAO_ASR_MULTILINGUAL === 'true'
      },

      // FunASR配置 - 参照Python config.yaml
      funasr: {
        // 服务器模式配置
        host: process.env.FUNASR_HOST || 'localhost',
        port: 10096,
        is_ssl: process.env.FUNASR_SSL === 'true',
        api_key: process.env.FUNASR_API_KEY || 'none',
        serverUrl: process.env.FUNASR_SERVER_URL,  // 兼容旧配置

        // 模式配置
        mode: process.env.FUNASR_MODE || 'offline',
        chunk_size: [5, 10, 5],
        chunk_interval: 10,
        itn: process.env.FUNASR_ITN !== 'false'
      },

      // 讯飞STT配置
      xunfei: {
        appId: process.env.XUNFEI_APP_ID,
        apiKey: process.env.XUNFEI_API_KEY,
        apiSecret: process.env.XUNFEI_API_SECRET
      },

      // 阿里云STT配置
      aliyun: {
        accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
        appKey: process.env.ALIYUN_ASR_APP_KEY
      }
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
    },

    // RAG 服务配置
    rag: {
      enabled: process.env.RAG_ENABLED === 'true' || false,
      qdrant: {
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY || '',
        collection: process.env.QDRANT_COLLECTION || 'knowledge_base'
      },
      embedding: {
        provider: process.env.EMBEDDING_PROVIDER || 'openai',
        baseUrl: process.env.EMBEDDING_BASE_URL || '',  // 自定义 Embedding 服务地址
        model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        apiKey: process.env.OPENAI_API_KEY || '',
        dimension: parseInt(process.env.EMBEDDING_DIMENSION) || 1536
      },
      search: {
        limit: parseInt(process.env.RAG_SEARCH_LIMIT) || 5,
        scoreThreshold: parseFloat(process.env.RAG_SCORE_THRESHOLD) || 0.7
      }
    }
  }
};