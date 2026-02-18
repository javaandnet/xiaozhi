## 客户端间消息传递功能

### 功能概述
实现客户端之间的点对点消息传递功能，允许任意两个已连接的客户端直接通信。

### 消息格式

#### 发送消息
客户端向服务器发送好友消息的格式：
```json
{
  "type": "friend",
  "clientid": "目标客户端ID",
  "data": "消息内容"
}
```

#### 接收消息
目标客户端收到的消息格式：
```json
{
  "type": "friend",
  "from": "发送方客户端ID",
  "data": "消息内容",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### 发送确认
发送方收到的确认消息格式：
```json
{
  "type": "friend_ack",
  "to": "目标客户端ID",
  "data": "消息内容",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "status": "sent"
}
```

### 使用示例

#### JavaScript客户端示例
```javascript
// 发送好友消息
const sendMessage = (targetClientId, messageData) => {
  const message = {
    type: 'friend',
    clientid: targetClientId,
    data: messageData
  };
  
  websocket.send(JSON.stringify(message));
};

// 监听好友消息
websocket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'friend') {
    console.log(`收到来自 ${message.from} 的消息: ${message.data}`);
    // 处理收到的好友消息
  } else if (message.type === 'friend_ack') {
    console.log(`消息已发送给 ${message.to}`);
    // 处理发送确认
  }
};

// 使用示例
sendMessage('client-xyz-123', '你好，这是一条测试消息！');
```

#### Python客户端示例
```python
import json
import websocket

# 发送好友消息
def send_friend_message(ws, target_client_id, message_data):
    message = {
        'type': 'friend',
        'clientid': target_client_id,
        'data': message_data
    }
    ws.send(json.dumps(message))

# WebSocket消息处理
def on_message(ws, message):
    data = json.loads(message)
    
    if data['type'] == 'friend':
        print(f"收到来自 {data['from']} 的消息: {data['data']}")
        # 处理好友消息
    elif data['type'] == 'friend_ack':
        print(f"消息已发送给 {data['to']}")
        # 处理发送确认

# 使用示例
send_friend_message(websocket, 'client-xyz-123', '你好，这是一条测试消息！')
```

### 错误处理

系统会返回以下错误消息：

```json
{
  "type": "error",
  "message": "错误描述",
  "session_id": "会话ID"
}
```

常见错误情况：
- `缺少目标客户端ID` - 未提供clientid参数
- `消息内容不能为空` - data参数为空
- `目标客户端不存在: xxx` - 指定的客户端ID不存在
- `目标客户端不在线: xxx` - 目标客户端当前不在线
- `设备管理器未初始化` - 系统内部错误

### 测试方法

使用提供的测试客户端进行功能验证：

```bash
node test/friend-message-test.js
```

测试将自动创建两个客户端连接，并进行以下测试：
1. Client-A 发送消息给 Client-B
2. Client-B 回复消息给 Client-A
3. 测试错误情况（发送给不存在的客户端）

### 注意事项

1. **客户端ID获取**：连接建立后，服务器会在`connection_ack`消息中返回分配的clientId
2. **在线状态**：只能向当前在线的客户端发送消息
3. **消息可靠性**：目前为尽力而为传输，不保证消息一定送达
4. **安全性**：建议在生产环境中添加身份验证和消息过滤机制
5. **性能考虑**：大量并发消息可能影响服务器性能
