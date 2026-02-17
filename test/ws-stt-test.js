/**
 * WebSocket STT测试客户端
 * 测试语音识别流程 - 使用Opus格式
 */
import fs from 'fs';
import WebSocket from 'ws';

const SERVER_URL = 'ws://localhost:9999';

async function main() {
  console.log('🚀 开始WebSocket STT测试 (Opus格式)');
  console.log('==================================================');

  // 使用已有的测试音频
  console.log('\n📦 步骤1: 加载测试音频...');
  const pcmPath = '/Users/fengleiren/git/xiaozhi/data/stt-test-output/test-audio.pcm';

  if (!fs.existsSync(pcmPath)) {
    console.error('❌ 测试音频文件不存在，请先运行 test/stt-test.js 生成');
    process.exit(1);
  }

  const pcmData = fs.readFileSync(pcmPath);
  console.log(`✅ PCM数据: ${pcmData.length} bytes`);

  // 将PCM编码为Opus帧
  console.log('\n📦 步骤2: 编码为Opus格式...');
  const opusFrames = [];
  const frameSize = 16000 * 60 / 1000 * 2; // 60ms帧，16bit = 1920 bytes
  const frameCount = Math.ceil(pcmData.length / frameSize);

  // 使用opusscript编码
  const { default: OpusScript } = await import('opusscript');
  const encoder = new OpusScript(16000, 1, OpusScript.Application.VOIP);

  for (let i = 0; i < frameCount; i++) {
    const start = i * frameSize;
    const end = Math.min(start + frameSize, pcmData.length);
    const frame = pcmData.slice(start, end);

    // 如果帧太小，填充0
    let frameData = frame;
    if (frame.length < frameSize) {
      frameData = Buffer.alloc(frameSize);
      frame.copy(frameData);
    }

    // 编码为Opus
    const opusFrame = encoder.encode(frameData, 960); // 960 samples = 60ms @ 16kHz
    opusFrames.push(opusFrame);
  }

  console.log(`✅ Opus编码完成: ${opusFrames.length} 帧`);

  // 连接WebSocket
  console.log('\n📦 步骤3: 连接WebSocket服务器...');
  const ws = new WebSocket(SERVER_URL);

  ws.on('open', async () => {
    console.log('✅ WebSocket连接成功');

    // 发送hello消息
    console.log('\n📤 发送hello消息...');
    ws.send(JSON.stringify({
      type: 'hello',
      version: 1,
      transport: 'websocket',
      audio_params: {
        format: 'opus',
        sampleRate: 16000,
        channels: 1,
        frameDuration: 60
      }
    }));
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`📥 收到消息: ${msg.type}`, JSON.stringify(msg).substring(0, 200));

      if (msg.type === 'hello') {
        console.log(`✅ 握手成功，Session: ${msg.session_id}`);

        // 发送listen start
        console.log('\n📤 发送listen start...');
        ws.send(JSON.stringify({
          type: 'listen',
          state: 'start',
          mode: 'auto'
        }));

        // 发送Opus帧
        console.log('\n📤 发送Opus音频数据...');
        for (let i = 0; i < opusFrames.length; i++) {
          ws.send(opusFrames[i]);
          // 模拟帧间隔
          await new Promise(r => setTimeout(r, 10));
        }

        console.log(`✅ 发送了 ${opusFrames.length} 个Opus帧`);

        // 等待VAD检测和识别
        await new Promise(r => setTimeout(r, 1500));

        // 发送listen stop
        console.log('\n📤 发送listen stop...');
        ws.send(JSON.stringify({
          type: 'listen',
          state: 'stop'
        }));
      }

      if (msg.type === 'stt') {
        console.log(`\n🎤 STT识别结果: ${msg.text}`);
      }

      if (msg.type === 'llm') {
        console.log(`\n💬 LLM回复: ${msg.text}`);
      }

    } catch (e) {
      // 二进制数据，忽略
    }
  });

  ws.on('error', (err) => {
    console.error('❌ WebSocket错误:', err.message);
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket连接关闭');
  });

  // 30秒后退出
  setTimeout(() => {
    console.log('\n⏰ 测试超时，退出');
    process.exit(0);
  }, 30000);
}

main().catch(console.error);
