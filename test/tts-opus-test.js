/**
 * TTS到Opus转换测试
 * 测试TTS合成和MP3到Opus的转换流程
 */

import TtsService from '../core/services/tts.js';
import audioConverter from '../core/utils/audioConverter.js';

async function testTtsToOpus() {
  console.log('🧪 开始TTS到Opus转换测试...\n');

  try {
    // 1. 初始化TTS服务
    console.log('1️⃣ 初始化TTS服务...');
    const ttsService = new TtsService({
      provider: 'edge',
      voice: 'zh-CN-XiaoxiaoNeural'
    });
    await ttsService.initialize();
    console.log('✅ TTS服务初始化成功\n');

    // 2. 合成测试文本
    const testText = '你好，我是小智，很高兴为你服务！';
    console.log(`2️⃣ 合成文本: "${testText}"`);

    const ttsResult = await ttsService.synthesize(testText);
    console.log(`✅ TTS合成完成`);
    console.log(`   - 音频大小: ${ttsResult.audio?.length || ttsResult.length} bytes`);
    console.log(`   - 格式: ${ttsResult.format || 'unknown'}`);
    console.log(`   - 采样率: ${ttsResult.sampleRate || 'unknown'} Hz\n`);

    // 3. 转换为Opus帧
    console.log('3️⃣ 转换为Opus帧...');
    const audioBuffer = ttsResult.audio || ttsResult;
    const opusFrames = await audioConverter.mp3ToOpusFrames(audioBuffer);
    console.log(`✅ Opus编码完成`);
    console.log(`   - 总帧数: ${opusFrames.length}`);
    console.log(`   - 第一帧大小: ${opusFrames[0]?.length || 0} bytes`);
    console.log(`   - 最后一帧大小: ${opusFrames[opusFrames.length - 1]?.length || 0} bytes\n`);

    // 4. 计算预估播放时长
    const frameDuration = 60; // ms
    const estimatedDuration = opusFrames.length * frameDuration;
    console.log(`4️⃣ 预估播放时长: ${estimatedDuration}ms (${(estimatedDuration / 1000).toFixed(2)}秒)\n`);

    console.log('✅ 所有测试通过！');
    process.exit(0);

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
testTtsToOpus();
