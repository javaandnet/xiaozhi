import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 服务器诊断工具');

// 检查环境变量
console.log('🔧 环境变量检查:');
console.log('  PORT:', process.env.PORT || '未设置');
console.log('  NODE_ENV:', process.env.NODE_ENV || '未设置');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8000;

console.log(`🚀 尝试启动服务器在端口 ${PORT}`);

// 中间件
app.use(express.json());

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

app.get('/', (req, res) => {
  res.json({
    message: '小智服务器诊断工具',
    status: 'running',
    port: PORT
  });
});

// WebSocket连接处理
wss.on('connection', (ws, req) => {
  console.log('📱 新的WebSocket连接');
  console.log('  客户端IP:', req.socket.remoteAddress);
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📥 收到WebSocket消息:', message);
      
      // 回显消息
      ws.send(JSON.stringify({
        type: 'echo',
        original: message,
        timestamp: new Date().toISOString()
      }));
      
      // 特殊处理MCP测试消息
      if (message.type === 'hello' && message.features?.mcp) {
        console.log('🎯 检测到MCP支持设备');
        // 模拟MCP初始化流程
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'mcp',
            payload: {
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                  name: 'XiaozhiServer',
                  version: '1.0.0'
                }
              }
            }
          }));
        }, 1000);
      }
    } catch (error) {
      console.log('📥 收到原始数据:', data.toString());
      ws.send(JSON.stringify({
        type: 'error',
        message: '无法解析消息',
        error: error.message
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket连接关闭');
  });
  
  ws.on('error', (error) => {
    console.log('❌ WebSocket错误:', error.message);
  });
});

// 错误处理
server.on('error', (error) => {
  console.error('❌ 服务器启动错误:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.log(`💡 端口 ${PORT} 已被占用，请尝试其他端口`);
  }
});

server.listen(PORT, () => {
  console.log(`✅ 服务器启动成功！`);
  console.log(`🌐 HTTP服务器: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket服务器: ws://localhost:${PORT}`);
  console.log(`🏥 健康检查: http://localhost:${PORT}/health`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到 SIGINT 信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});