/**
 * 好友消息功能测试客户端
 * 用于测试客户端间消息传递功能
 */

import WebSocket from 'ws';

class FriendMessageTestClient {
  constructor(clientId, url = 'ws://localhost:8003') {
    this.clientId = clientId;
    this.url = url;
    this.ws = null;
    this.isConnected = false;
    this.receivedMessages = [];
  }

  // 连接到服务器
  async connect() {
    return new Promise((resolve, reject) => {
      console.log(`[${this.clientId}] 正在连接到服务器...`);
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log(`[${this.clientId}] ✓ 连接成功`);
        this.isConnected = true;
        this.setupEventHandlers();
        resolve();
      });

      this.ws.on('error', (error) => {
        console.error(`[${this.clientId}] 连接错误:`, error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log(`[${this.clientId}] 连接已关闭`);
        this.isConnected = false;
      });
    });
  }

  // 设置事件处理器
  setupEventHandlers() {
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleServerMessage(message);
      } catch (error) {
        console.error(`[${this.clientId}] 解析服务器消息失败:`, error);
      }
    });
  }

  // 处理服务器消息
  handleServerMessage(message) {
    console.log(`[${this.clientId}] ← 收到消息:`, JSON.stringify(message, null, 2));
    
    switch (message.type) {
      case 'connection_ack':
        console.log(`[${this.clientId}] ✓ 连接确认，我的clientId是: ${message.clientId}`);
        this.actualClientId = message.clientId; // 保存服务器分配的真正clientId
        break;
        
      case 'friend':
        // 收到来自其他客户端的消息
        this.receivedMessages.push({
          from: message.from,
          data: message.data,
          timestamp: message.timestamp
        });
        console.log(`[${this.clientId}] 📨 收到来自 ${message.from} 的好友消息: ${message.data}`);
        break;
        
      case 'friend_ack':
        // 发送消息的确认回执
        console.log(`[${this.clientId}] ✅ 消息发送确认: 发送给 ${message.to}, 状态: ${message.status}`);
        break;
        
      case 'error':
        console.error(`[${this.clientId}] ❌ 错误: ${message.message}`);
        break;
        
      default:
        console.log(`[${this.clientId}] 📥 其他消息类型: ${message.type}`);
    }
  }

  // 获取服务器分配的实际clientId
  getActualClientId() {
    return this.actualClientId;
  }

  // 发送好友消息
  sendFriendMessage(targetClientId, data) {
    if (!this.isConnected) {
      console.error(`[${this.clientId}] 未连接到服务器`);
      return false;
    }

    if (!this.actualClientId) {
      console.error(`[${this.clientId}] 尚未获得服务器分配的clientId`);
      return false;
    }

    const message = {
      type: 'friend',
      clientid: targetClientId,
      data: data
    };

    try {
      this.ws.send(JSON.stringify(message));
      console.log(`[${this.clientId}] → 发送好友消息给 ${targetClientId}: ${data}`);
      return true;
    } catch (error) {
      console.error(`[${this.clientId}] 发送消息失败:`, error);
      return false;
    }
  }

  // 发送其他类型消息（用于测试）
  sendMessage(type, payload = {}) {
    if (!this.isConnected) {
      console.error(`[${this.clientId}] 未连接到服务器`);
      return false;
    }

    const message = {
      type: type,
      ...payload
    };

    try {
      this.ws.send(JSON.stringify(message));
      console.log(`[${this.clientId}] → 发送消息:`, message);
      return true;
    } catch (error) {
      console.error(`[${this.clientId}] 发送消息失败:`, error);
      return false;
    }
  }

  // 关闭连接
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.isConnected = false;
      console.log(`[${this.clientId}] 已断开连接`);
    }
  }

  // 获取收到的消息统计
  getMessageStats() {
    return {
      totalReceived: this.receivedMessages.length,
      messages: this.receivedMessages
    };
  }
}

// 测试函数
async function runFriendMessageTest() {
  console.log('🚀 开始好友消息功能测试\n');

  // 创建两个测试客户端
  const clientA = new FriendMessageTestClient('Client-A');
  const clientB = new FriendMessageTestClient('Client-B');

  try {
    // 连接两个客户端
    await clientA.connect();
    await clientB.connect();

    console.log('\n=== 测试步骤 1: 等待连接稳定 ===');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 等待获取真实clientId
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const clientAId = clientA.getActualClientId();
    const clientBId = clientB.getActualClientId();
    
    if (!clientAId || !clientBId) {
      console.error('未能获取客户端ID，测试终止');
      return;
    }
    
    console.log(`\n=== 客户端ID映射 ===`);
    console.log(`Client-A 显示名: ${clientA.clientId}, 实际ID: ${clientAId}`);
    console.log(`Client-B 显示名: ${clientB.clientId}, 实际ID: ${clientBId}`);

    console.log('\n=== 测试步骤 2: Client-A 发送消息给 Client-B ===');
    clientA.sendFriendMessage(clientBId, '你好，我是Client-A！');

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n=== 测试步骤 3: Client-B 回复消息给 Client-A ===');
    clientB.sendFriendMessage(clientAId, '你好Client-A，我是Client-B！很高兴认识你。');

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n=== 测试步骤 4: Client-A 再次发送消息 ===');
    clientA.sendFriendMessage(clientBId, '测试消息 - 当前时间: ' + new Date().toLocaleString());

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n=== 测试步骤 5: 测试错误情况 - 发送给不存在的客户端 ===');
    clientA.sendFriendMessage('non-existent-client', '这条消息应该会失败');

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 显示测试结果
    console.log('\n=== 测试结果统计 ===');
    console.log('Client-A 收到的消息:', clientA.getMessageStats());
    console.log('Client-B 收到的消息:', clientB.getMessageStats());

  } catch (error) {
    console.error('测试过程中发生错误:', error);
  } finally {
    // 清理连接
    console.log('\n=== 清理连接 ===');
    clientA.disconnect();
    clientB.disconnect();
    console.log('测试完成');
  }
}

// 如果直接运行此文件，则执行测试
if (process.argv[1] && import.meta.url.startsWith(`file://${process.argv[1]}`)) {
  runFriendMessageTest().catch(console.error);
}

export { FriendMessageTestClient, runFriendMessageTest };