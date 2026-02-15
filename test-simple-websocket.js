// 简单测试WebSocket协议处理器
const WebSocketProtocol = require('./core/protocols/websocket');
const WebSocket = require('ws');
const http = require('http');

// 创建简单的HTTP服务器
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// 创建协议处理器实例
const protocol = new WebSocketProtocol({ wss });

// 启动服务器
server.listen(3002, () => {
  console.log('测试服务器启动在端口 3002');
  
  // 创建测试客户端
  const ws = new WebSocket('ws://localhost:3002');
  
  ws.on('open', () => {
    console.log('客户端连接成功');
    
    // 发送测试消息
    ws.send(JSON.stringify({
      type: 'start_recognition',
      sessionId: 'test_session'
    }));
  });
  
  ws.on('message', (data) => {
    console.log('收到服务器响应:', data.toString());
    ws.close();
    server.close();
  });
  
  ws.on('close', () => {
    console.log('客户端连接关闭');
  });
});

// 处理WebSocket连接
wss.on('connection', (ws, req) => {
  console.log('新的WebSocket连接');
  protocol.handleConnection(ws, req);
});