/**
 * 浏览器录音模拟测试客户端
 * 模拟 recorder.js 的音频发送模式：AudioContext + Opus 编码
 * 
 * 使用方式：
 *   node test/browser-recorder-simulation.js
 * 
 * 音频流程：
 *   麦克风 → AudioContext → ScriptProcessorNode → Float32 PCM → Int16 PCM → Opus 编码 → WebSocket 发送
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 配置参数 ====================
const SERVER_URL = process.env.WS_URL || 'ws://localhost:8003';

// 与 recorder.js 保持一致的参数
const AUDIO_CONFIG = {
    sampleRate: 16000,      // 采样率
    channels: 1,            // 声道数
    frameSize: 960,         // 帧大小：60ms @ 16kHz = 960 samples
    frameDuration: 60,      // 帧时长 (ms)
    bitRate: 16000          // 比特率
};

// 测试音频文件路径
const TEST_AUDIO_PATH = process.env.AUDIO_FILE ||
    path.join(__dirname, '../data/stt-test-output/test-audio.pcm');

// ==================== Opus 编码器 ====================
let opusEncoder = null;

async function initOpusEncoder() {
    const { default: OpusScript } = await import('opusscript');
    opusEncoder = new OpusScript(
        AUDIO_CONFIG.sampleRate,
        AUDIO_CONFIG.channels,
        OpusScript.Application.VOIP
    );
    console.log('✅ Opus 编码器初始化成功');
    return opusEncoder;
}

/**
 * 将 PCM 数据编码为 Opus 帧
 * @param {Buffer} pcmData - PCM 音频数据 (16-bit, 16kHz, mono)
 * @returns {Buffer[]} Opus 帧数组
 */
function encodePcmToOpusFrames(pcmData) {
    const frames = [];
    const bytesPerFrame = AUDIO_CONFIG.frameSize * 2; // 16-bit = 2 bytes per sample
    const frameCount = Math.ceil(pcmData.length / bytesPerFrame);

    console.log(`📊 PCM 数据: ${pcmData.length} bytes`);
    console.log(`📊 每帧大小: ${bytesPerFrame} bytes (${AUDIO_CONFIG.frameSize} samples)`);
    console.log(`📊 总帧数: ${frameCount}`);

    for (let i = 0; i < frameCount; i++) {
        const start = i * bytesPerFrame;
        const end = Math.min(start + bytesPerFrame, pcmData.length);
        let frameData = pcmData.slice(start, end);

        // 如果帧太小，用 0 填充（与 recorder.js stop() 方法一致）
        if (frameData.length < bytesPerFrame) {
            const paddedFrame = Buffer.alloc(bytesPerFrame, 0);
            frameData.copy(paddedFrame);
            frameData = paddedFrame;
        }

        // 编码为 Opus
        const opusFrame = opusEncoder.encode(frameData, AUDIO_CONFIG.frameSize);
        frames.push(opusFrame);
    }

    return frames;
}

// ==================== 测试流程 ====================

async function runTest() {
    console.log('========================================');
    console.log('🧪 浏览器录音模拟测试');
    console.log('========================================');
    console.log(`📡 服务器地址: ${SERVER_URL}`);
    console.log(`🎵 音频配置: ${JSON.stringify(AUDIO_CONFIG)}`);
    console.log('');

    // 步骤 1: 加载测试音频
    console.log('📦 步骤 1: 加载测试音频...');
    if (!fs.existsSync(TEST_AUDIO_PATH)) {
        console.error(`❌ 测试音频文件不存在: ${TEST_AUDIO_PATH}`);
        console.error('请先运行 test/stt-test.js 生成测试音频');
        process.exit(1);
    }
    const pcmData = fs.readFileSync(TEST_AUDIO_PATH);
    console.log(`✅ 已加载音频: ${TEST_AUDIO_PATH}`);
    console.log(`   文件大小: ${pcmData.length} bytes`);
    console.log(`   时长: ${(pcmData.length / 2 / AUDIO_CONFIG.sampleRate).toFixed(2)} 秒`);

    // 步骤 2: 初始化 Opus 编码器
    console.log('\n📦 步骤 2: 初始化 Opus 编码器...');
    await initOpusEncoder();

    // 步骤 3: 编码 PCM 为 Opus 帧
    console.log('\n📦 步骤 3: 编码 PCM 为 Opus 帧...');
    const opusFrames = encodePcmToOpusFrames(pcmData);
    console.log(`✅ Opus 编码完成: ${opusFrames.length} 帧`);

    // 统计帧大小
    const frameSizes = opusFrames.map(f => f.length);
    const avgFrameSize = frameSizes.reduce((a, b) => a + b, 0) / frameSizes.length;
    console.log(`   平均帧大小: ${avgFrameSize.toFixed(1)} bytes`);
    console.log(`   最小帧大小: ${Math.min(...frameSizes)} bytes`);
    console.log(`   最大帧大小: ${Math.max(...frameSizes)} bytes`);

    // 步骤 4: 连接 WebSocket
    console.log('\n📦 步骤 4: 连接 WebSocket 服务器...');
    const ws = new WebSocket(SERVER_URL);

    // 消息处理
    let sessionEstablished = false;

    ws.on('open', async () => {
        console.log('✅ WebSocket 连接成功');

        // 发送 hello 消息（与浏览器一致）
        console.log('\n📤 发送 hello 消息...');
        const helloMessage = {
            type: 'hello',
            version: 1,
            transport: 'websocket',
            audio_params: {
                format: 'opus',
                sampleRate: AUDIO_CONFIG.sampleRate,
                channels: AUDIO_CONFIG.channels,
                frameDuration: AUDIO_CONFIG.frameDuration
            }
        };
        ws.send(JSON.stringify(helloMessage));
        console.log(`   ${JSON.stringify(helloMessage)}`);
    });

    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data.toString());
            const msgPreview = JSON.stringify(msg).substring(0, 300);
            console.log(`\n📥 收到消息 [${msg.type}]: ${msgPreview}`);

            // 处理 hello 响应
            if (msg.type === 'hello') {
                console.log(`✅ 握手成功，Session: ${msg.session_id}`);
                sessionEstablished = true;

                // 发送 listen start（与 recorder.js start() 一致）
                console.log('\n📤 发送 listen start...');
                const listenStartMsg = {
                    type: 'listen',
                    state: 'start'
                };
                ws.send(JSON.stringify(listenStartMsg));
                console.log(`   ${JSON.stringify(listenStartMsg)}`);

                // 发送 Opus 帧（模拟实时发送）
                console.log('\n📤 发送 Opus 音频帧...');
                const sendInterval = AUDIO_CONFIG.frameDuration; // 按帧时长间隔发送

                for (let i = 0; i < opusFrames.length; i++) {
                    ws.send(opusFrames[i]);

                    // 每 10 帧打印进度
                    if ((i + 1) % 10 === 0 || i === opusFrames.length - 1) {
                        console.log(`   已发送 ${i + 1}/${opusFrames.length} 帧`);
                    }

                    // 模拟实时发送间隔
                    if (i < opusFrames.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, sendInterval));
                    }
                }
                console.log(`✅ 发送完成: ${opusFrames.length} 个 Opus 帧`);

                // 等待 VAD 检测
                await new Promise(resolve => setTimeout(resolve, 500));

                // 发送 listen stop（与 recorder.js stop() 一致）
                console.log('\n📤 发送 listen stop...');
                const listenStopMsg = {
                    type: 'listen',
                    state: 'stop'
                };
                ws.send(JSON.stringify(listenStopMsg));
                console.log(`   ${JSON.stringify(listenStopMsg)}`);

                // 发送空帧作为结束信号（与 recorder.js stop() 一致）
                console.log('\n📤 发送空帧结束信号...');
                ws.send(new Uint8Array(0));
            }

            // 处理 STT 结果
            if (msg.type === 'stt') {
                console.log('\n🎤 ============ STT 识别结果 ============');
                console.log(`   文本: ${msg.text}`);
                console.log('========================================');
            }

            // 处理 LLM 结果
            if (msg.type === 'llm') {
                console.log('\n💬 ============ LLM 回复 ============');
                console.log(`   文本: ${msg.text}`);
                console.log('====================================');
            }

            // 处理 TTS 结果
            if (msg.type === 'tts') {
                console.log(`\n🔊 TTS 状态: ${msg.state}`);
            }

        } catch (e) {
            // 二进制数据，忽略
            if (data instanceof Buffer) {
                console.log(`📥 收到二进制数据: ${data.length} bytes`);
            }
        }
    });

    ws.on('error', (err) => {
        console.error('❌ WebSocket 错误:', err.message);
    });

    ws.on('close', (code, reason) => {
        console.log(`\n🔌 WebSocket 连接关闭: code=${code}, reason=${reason || '无'}`);

        // 清理 Opus 编码器
        if (opusEncoder) {
            opusEncoder.delete();
            console.log('🧹 Opus 编码器已清理');
        }

        process.exit(0);
    });

    // 超时处理
    const timeout = setTimeout(() => {
        console.log('\n⏰ 测试超时 (60秒)，退出');
        ws.close();
        process.exit(0);
    }, 60000);

    // 清理超时
    ws.on('close', () => clearTimeout(timeout));
}

// ==================== 运行测试 ====================

console.log('');
runTest().catch(err => {
    console.error('❌ 测试失败:', err);
    process.exit(1);
});
