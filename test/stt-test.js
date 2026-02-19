#!/usr/bin/env node

/**
 * STT服务测试 - 使用TTS生成测试音频，然后进行语音识别
 * 测试内容：新年快乐万事如意
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SttService from '../core/services/stt.js';
import TtsService from '../core/services/tts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试配置
const TEST_TEXT = '新年快乐,万事如意,模拟模式';
const OUTPUT_DIR = path.join(__dirname, '../data/stt-test-output');

async function ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
}

/**
 * 使用TTS生成测试音频
 */
async function generateTestAudio(ttsService, text) {
    console.log(`\n🔊 步骤1: 使用TTS生成测试音频`);
    console.log(`   文本: "${text}"`);

    const audioBuffer = await ttsService.synthesize(text);
    const mp3Path = path.join(OUTPUT_DIR, 'test-audio.mp3');

    fs.writeFileSync(mp3Path, audioBuffer.audio || audioBuffer);
    console.log(`   ✅ MP3音频已保存: ${mp3Path}`);
    console.log(`   📊 文件大小: ${(audioBuffer.audio || audioBuffer).length} bytes`);

    return { mp3Path, audioBuffer: audioBuffer.audio || audioBuffer };
}

/**
 * 将MP3转换为PCM格式（16kHz, 单声道, 16-bit）
 */
async function convertToPcm(mp3Path) {
    console.log(`\n🔄 步骤2: 将MP3转换为PCM格式`);
    console.log(`   输入: ${mp3Path}`);

    const pcmPath = mp3Path.replace('.mp3', '.pcm');

    return new Promise((resolve, reject) => {
        const ffmpegProcess = spawn('ffmpeg', [
            '-i', mp3Path,
            '-f', 's16le',      // 16-bit signed little-endian
            '-ar', '16000',     // 16kHz采样率
            '-ac', '1',         // 单声道
            '-y',               // 覆盖输出文件
            pcmPath
        ]);

        let stderrData = '';

        ffmpegProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        ffmpegProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`   ⚠️ FFmpeg警告: ${stderrData.slice(-200)}`);
            }

            if (fs.existsSync(pcmPath)) {
                const pcmBuffer = fs.readFileSync(pcmPath);
                console.log(`   ✅ PCM转换完成: ${pcmPath}`);
                console.log(`   📊 PCM大小: ${pcmBuffer.length} bytes`);
                console.log(`   ⏱️  音频时长: ${(pcmBuffer.length / 32000).toFixed(2)}秒`);
                resolve({ pcmPath, pcmBuffer });
            } else {
                reject(new Error('PCM文件生成失败'));
            }
        });

        ffmpegProcess.on('error', (err) => {
            reject(new Error(`FFmpeg进程错误: ${err.message}`));
        });
    });
}

/**
 * 将PCM转换为Opus格式进行测试
 */
async function convertPcmToOpus(pcmPath) {
    console.log(`\n🔄 步骤3: 将PCM编码为Opus格式`);

    const opusFrames = [];
    const OpusEncoder = (await import('opusscript')).default || (await import('opusscript'));
    const encoder = new OpusEncoder(16000, 1);

    const pcmBuffer = fs.readFileSync(pcmPath);
    const frameSize = 960; // 60ms at 16kHz
    const frameBytes = frameSize * 2; // 16-bit = 2 bytes

    for (let i = 0; i < pcmBuffer.length; i += frameBytes) {
        const frame = pcmBuffer.slice(i, i + frameBytes);
        if (frame.length === frameBytes) {
            try {
                const opusFrame = encoder.encode(frame, frameSize);
                opusFrames.push(opusFrame);
            } catch (e) {
                // 忽略编码错误
            }
        }
    }

    console.log(`   ✅ Opus编码完成: ${opusFrames.length} 帧`);

    return opusFrames;
}

/**
 * 使用STT服务进行语音识别
 */
async function testSttRecognition(sttService, pcmBuffer, opusFrames) {
    console.log(`\n🎤 步骤4: 使用STT服务进行语音识别`);

    // 测试1: 直接识别PCM数据
    console.log('\n   测试A: 直接识别PCM数据');
    try {
        const resultPcm = await sttService._recognizePcm(pcmBuffer, 'test-session');
        console.log(`   📝 识别结果: "${resultPcm.text}"`);
        console.log(`   📊 置信度: ${resultPcm.confidence}`);
        console.log(`   🔧 提供商: ${resultPcm.provider}`);
    } catch (error) {
        console.log(`   ⚠️ PCM识别失败: ${error.message}`);
    }

    // 测试2: 模拟Opus流式识别
    console.log('\n   测试B: 模拟Opus流式识别');

    // 创建会话
    const session = sttService.createSession('test-opus-session', {
        listenMode: 'auto'
    });
    const sessionId = session.id;  // 获取会话ID

    // 模拟接收Opus帧
    console.log(`   📥 发送 ${opusFrames.length} 个Opus帧...`);

    for (let i = 0; i < opusFrames.length; i++) {
        await sttService.receiveAudio(sessionId, opusFrames[i], {
            hasVoice: true,
            format: 'opus'
        });

        // 每10帧打印一次进度
        if ((i + 1) % 10 === 0 || i === opusFrames.length - 1) {
            process.stdout.write(`\r   📥 进度: ${i + 1}/${opusFrames.length} 帧`);
        }
    }
    console.log('\n   ✅ 音频帧发送完成');

    // 触发语音停止处理
    console.log('\n   🔄 触发语音停止处理...');
    const currentSession = sttService.getSession(sessionId);
    if (currentSession && currentSession.audioBuffer.length > 0) {
        try {
            const result = await sttService._handleVoiceStop(currentSession, currentSession.audioBuffer);
            if (result) {
                console.log(`   📝 最终识别结果: "${result.text}"`);
                console.log(`   📊 置信度: ${result.confidence}`);
            }
        } catch (error) {
            console.log(`   ⚠️ 识别失败: ${error.message}`);
        }
    }

    // 清理会话
    await sttService.closeSession(sessionId);

    // 测试3: 同步识别接口
    console.log('\n   测试C: 同步识别接口');
    try {
        const syncResult = await sttService.recognize(pcmBuffer, {
            sessionId: 'test-sync',
            format: 'pcm'
        });
        console.log(`   📝 识别结果: "${syncResult.text}"`);
        console.log(`   📊 置信度: ${syncResult.confidence}`);
        console.log(`   🔧 提供商: ${syncResult.provider}`);
    } catch (error) {
        console.log(`   ⚠️ 同步识别失败: ${error.message}`);
    }
}

/**
 * 主测试流程
 */
async function runTest() {
    console.log('🚀 开始STT服务测试');
    console.log('='.repeat(50));
    console.log(`测试文本: "${TEST_TEXT}"`);
    console.log(`输出目录: ${OUTPUT_DIR}`);

    await ensureOutputDir();

    let ttsService = null;
    let sttService = null;

    try {
        // 初始化TTS服务
        console.log('\n📦 初始化TTS服务...');
        ttsService = new TtsService({
            provider: 'edge',
            voice: 'zh-CN-XiaoxiaoNeural'
        });
        await ttsService.initialize();
        console.log('✅ TTS服务初始化成功');

        // 初始化STT服务（模拟模式）
        console.log('\n📦 初始化STT服务...');

        // 支持通过环境变量切换提供商
        const sttProvider = process.env.STT_PROVIDER || 'doubao';

        sttService = new SttService({
            provider: sttProvider,
            language: 'zh-CN',
            sampleRate: 16000,
            outputDir: OUTPUT_DIR,
            // FunASR配置
            host: process.env.FUNASR_HOST || 'localhost',
            port: parseInt(process.env.FUNASR_PORT) || 10095,
            is_ssl: process.env.FUNASR_SSL === 'true',
            api_key: process.env.FUNASR_API_KEY || 'none',
            // 豆包配置
            appid: process.env.DOUBAO_ASR_APPID,
            cluster: process.env.DOUBAO_ASR_CLUSTER,
            access_token: process.env.DOUBAO_ASR_ACCESS_TOKEN,
        });

        await sttService.initialize();
        console.log('✅ STT服务初始化成功');
        console.log(`   模拟模式: ${sttService.simulationMode ? '是' : '否'}`);
        console.log(`   提供商: ${sttService.provider}`);

        // 步骤1: 生成测试音频
        const { mp3Path, audioBuffer } = await generateTestAudio(ttsService, TEST_TEXT);

        // 步骤2: 转换为PCM
        const { pcmPath, pcmBuffer } = await convertToPcm(mp3Path);

        // 步骤3: 编码为Opus
        const opusFrames = await convertPcmToOpus(pcmPath);

        // 步骤4: 进行STT识别测试
        await testSttRecognition(sttService, pcmBuffer, opusFrames);

        // 输出测试总结
        console.log('\n' + '='.repeat(50));
        console.log('📋 测试总结');
        console.log('='.repeat(50));
        console.log(`✅ TTS音频生成: 成功`);
        console.log(`✅ PCM转换: 成功`);
        console.log(`✅ Opus编码: 成功 (${opusFrames.length} 帧)`);
        console.log(`✅ STT服务: ${sttService.simulationMode ? '模拟模式' : '实际模式'}`);
        console.log(`\n📁 生成的文件:`);
        console.log(`   - MP3: ${mp3Path}`);
        console.log(`   - PCM: ${pcmPath}`);

        if (sttService.simulationMode) {
            console.log('\n💡 提示: 当前为模拟模式，如需实际识别请配置以下环境变量:');
            console.log('   DOUBAO_ASR_APPID=your_appid');
            console.log('   DOUBAO_ASR_CLUSTER=your_cluster');
            console.log('   DOUBAO_ASR_ACCESS_TOKEN=your_token');
            console.log('\n   或使用FunASR:');
            console.log('   FUNASR_SERVER_URL=ws://localhost:10095');
        }

        console.log('\n🎉 测试完成！');

    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        console.error(error.stack);
    } finally {
        // 清理资源
        if (ttsService) {
            try {
                await ttsService.destroy();
            } catch (e) { }
        }
        if (sttService) {
            try {
                await sttService.destroy();
            } catch (e) { }
        }
    }
}

// 运行测试
runTest().catch(console.error);
