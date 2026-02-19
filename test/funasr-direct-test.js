#!/usr/bin/env node
/**
 * FunASR直接测试 - 使用现有的WAV文件
 */
import fs from 'fs';
import WebSocket from 'ws';

const FUNASR_URL = 'wss://localhost:10096';
const WAV_FILE = '/Users/fengleiren/git/xiaozhi/data/debug-audio/audio-1771497609121.wav';

async function testFunASR() {
  console.log('🚀 开始FunASR直接测试');
  console.log('==================================================');

  // 读取WAV文件
  console.log('\n📦 步骤1: 读取WAV音频...');
  if (!fs.existsSync(WAV_FILE)) {
    console.error('❌ WAV文件不存在:', WAV_FILE);
    process.exit(1);
  }

  const wavData = fs.readFileSync(WAV_FILE);
  console.log(`✅ WAV数据: ${wavData.length} bytes`);

  // 跳过WAV头（44字节），获取PCM数据
  const pcmData = wavData.slice(44);
  console.log(`✅ PCM数据: ${pcmData.length} bytes`);

  // 连接FunASR
  console.log('\n📦 步骤2: 连接FunASR服务器...');
  const ws = new WebSocket(FUNASR_URL);

  ws.on('open', () => {
    console.log('✅ FunASR连接成功');

    // 发送配置消息
    const config = {
      mode: 'offline',
      chunk_size: [5, 10, 5],
      chunk_interval: 10,
      wav_name: 'test-audio',
      is_speaking: true,
      itn: false  // SenseVoice模式不支持ITN
    };

    console.log('\n📤 发送配置消息:', JSON.stringify(config));
    ws.send(JSON.stringify(config));

    // 发送PCM数据
    console.log('📤 发送PCM音频数据...');
    ws.send(pcmData);

    // 发送结束消息
    const endMessage = { is_speaking: false };
    console.log('📤 发送结束消息:', JSON.stringify(endMessage));
    ws.send(JSON.stringify(endMessage));
  });

  ws.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString());
      console.log('\n📥 收到FunASR响应:', JSON.stringify(response, null, 2));

      if (response.text) {
        console.log('\n🎤 识别结果:', response.text);
      }

      if (response.is_final) {
        console.log('\n✅ 识别完成');
        ws.close();
        process.exit(0);
      }
    } catch (error) {
      console.error('❌ 解析响应失败:', error.message);
    }
  });

  ws.on('error', (error) => {
    console.error('❌ FunASR错误:', error.message);
    process.exit(1);
  });

  ws.on('close', () => {
    console.log('\n🔌 FunASR连接关闭');
  });

  // 30秒超时
  setTimeout(() => {
    console.log('\n⏰ 测试超时');
    ws.close();
    process.exit(1);
  }, 30000);
}

testFunASR().catch(console.error);
