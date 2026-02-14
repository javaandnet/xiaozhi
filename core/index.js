// 核心模块入口文件
// 整合所有核心功能模块

const DeviceModel = require('./models/device');
const AudioModel = require('./models/audio');
const MessageModel = require('./models/message');
const SessionModel = require('./models/session');
const UserModel = require('./models/user');

const WebSocketProtocol = require('./protocols/websocket');
const HttpProtocol = require('./protocols/http');
const MqttProtocol = require('./protocols/mqtt');

const AudioService = require('./services/audio');
const TtsService = require('./services/tts');
const SttService = require('./services/stt');
const WakeWordService = require('./services/wakeword');
const LlmService = require('./services/llm');
const VadService = require('./services/vad');
const VoiceprintService = require('./services/voiceprint');
const MemoryService = require('./services/memory');
const IntentService = require('./services/intent');
const RagService = require('./services/rag');
const McpService = require('./services/mcp');

const DeviceManager = require('./managers/device');
const SessionManager = require('./managers/session');
const AudioManager = require('./managers/audio');

const WebSocketHandler = require('./handlers/websocket');
const HttpHandler = require('./handlers/http');
const CommandHandler = require('./handlers/command');

// 中间件
const AuthMiddleware = require('./middleware/auth');
const LoggingMiddleware = require('./middleware/logging');
const ValidationMiddleware = require('./middleware/validation');

// 核心配置
const config = require('../config');

module.exports = {
  // 数据模型
  models: {
    Device: DeviceModel,
    Audio: AudioModel,
    Message: MessageModel,
    Session: SessionModel,
    User: UserModel
  },
  
  // 通信协议
  protocols: {
    WebSocket: WebSocketProtocol,
    Http: HttpProtocol,
    Mqtt: MqttProtocol
  },
  
  // 服务层
  services: {
    Audio: AudioService,
    Tts: TtsService,
    Stt: SttService,
    WakeWord: WakeWordService,
    Llm: LlmService,
    Vad: VadService,
    Voiceprint: VoiceprintService,
    Memory: MemoryService,
    Intent: IntentService,
    Rag: RagService,
    Mcp: McpService
  },
  
  // 管理器
  managers: {
    Device: DeviceManager,
    Session: SessionManager,
    Audio: AudioManager
  },
  
  // 处理器
  handlers: {
    WebSocket: WebSocketHandler,
    Http: HttpHandler,
    Command: CommandHandler
  },
  
  // 中间件
  middleware: {
    Auth: AuthMiddleware,
    Logging: LoggingMiddleware,
    Validation: ValidationMiddleware
  },
  
  // 配置
  config
};