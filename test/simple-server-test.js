import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 8000;

// 简单的健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// WebSocket连接处理
wss.on('connection', (ws) => {
  console.log('📱 新的WebSocket连接');
  
  ws.on('message', (data) => {
    console.log('📥 收到消息:', data.toString());
    ws.send(JSON.stringify({ type: 'echo', message: data.toString() }));
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket连接关闭');
  });
});

server.listen(PORT, () => {
  console.log(`🚀 服务器启动成功，监听端口 ${PORT}`);
  console.log(`🌐 HTTP服务器: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket服务器: ws://localhost:${PORT}`);
});