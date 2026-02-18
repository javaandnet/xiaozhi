# WebSocket 消息类型常量化重构说明

## 概述

本次重构将 WebSocket 通信中使用的所有消息类型字符串定义集中到统一的常量文件中，提高代码的可维护性和一致性。

## 主要变更

### 1. 新增常量定义文件

**文件路径**: `/core/constants/messageTypes.js`

该文件定义了以下常量类别：

#### 客户端消息类型 (CLIENT_MESSAGE_TYPES)
- `HELLO` - 设备握手消息
- `LISTEN` - 监听控制消息  
- `ABORT` - 中断/终止消息
- `IOT` - IoT设备控制消息
- `CHAT` - 聊天消息
- `MCP` - MCP协议消息
- `START_RECOGNITION` - 开始语音识别
- `AUDIO_DATA` - 音频数据上传
- `WAKE_WORD_DETECTED` - 唤醒词检测通知
- `FRIEND` - 好友消息（客户端间通信）

#### 服务端消息类型 (SERVER_MESSAGE_TYPES)
- `CONNECTION_ACK` - 连接确认
- `ERROR` - 错误消息
- `HELLO` - 握手响应
- `RECOGNITION_STARTED` - 识别开始确认
- `STT` - 语音识别结果
- `LLM` - 大语言模型回复
- `TTS` - 文本转语音状态
- `TTS_FALLBACK` - TTS降级文本
- `TTS_DISABLED` - TTS未启用
- `AUDIO_RECEIVED` - 音频接收确认
- `WAKE_WORD_ACKNOWLEDGED` - 唤醒词确认
- `FRIEND` - 好友消息转发
- `FRIEND_ACK` - 好友消息确认

#### 子状态类型
- **TTS_STATES**: START, SENTENCE_START, PLAYING, STOP
- **LISTEN_STATES**: START, STOP, DETECT
- **CHAT_STATES**: COMPLETE, PROCESSING

### 2. 修改的核心文件

**文件**: `/core/handlers/websocket.js`

主要变更包括：
- 导入消息类型常量
- 替换所有硬编码的字符串消息类型
- 使用常量替代原有的字符串比较

### 3. 修改的测试文件

**文件**: `/test/friend-message-test.js`

更新了消息类型的处理逻辑，使用常量替代字符串。

## 优势

1. **类型安全**: 减少拼写错误导致的问题
2. **易于维护**: 集中管理所有消息类型定义
3. **代码复用**: 不同模块可以共享相同的消息类型定义
4. **IDE支持**: 更好的代码补全和重构支持
5. **文档化**: 常量定义本身就起到了文档作用

## 使用示例

### 旧代码（硬编码字符串）
```javascript
if (message.type === 'hello') {
  // 处理握手消息
}

this.sendMessage(ws, {
  type: 'error',
  message: 'Something went wrong'
});
```

### 新代码（使用常量）
```javascript
import { CLIENT_MESSAGE_TYPES, SERVER_MESSAGE_TYPES } from '../constants/messageTypes.js';

if (message.type === CLIENT_MESSAGE_TYPES.HELLO) {
  // 处理握手消息
}

this.sendMessage(ws, {
  type: SERVER_MESSAGE_TYPES.ERROR,
  message: 'Something went wrong'
});
```

## 向后兼容性

本次重构保持了完全的向后兼容性：
- 消息的实际字符串值保持不变
- 客户端无需做任何修改
- 现有的测试用例仍然可以正常工作

## 验证

可以通过运行现有测试来验证重构的正确性：
```bash
npm test
# 或者运行特定的WebSocket相关测试
node test/friend-message-test.js
```

## 后续建议

1. 逐步将项目中其他使用硬编码消息类型的地方也迁移到使用常量
2. 可以考虑为不同类型的客户端（如Web客户端、硬件设备）分别定义专用的消息类型常量
3. 建立代码规范，要求新开发的功能必须使用消息类型常量而非硬编码字符串