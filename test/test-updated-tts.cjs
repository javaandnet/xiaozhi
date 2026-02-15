#!/usr/bin/env node

/**
 * 测试更新后的TTS服务
 */

const TtsService = require('../core/tts-service');
const fs = require('fs');
const path = require('path');

async function testUpdatedTtsService() {
  console.log('🧪 测试更新后的TTS服务...');
  
  // 配置
  const config = {
    services: {
      tts: {
        provider: 'edge',
        voice: 'zh-CN-XiaoxiaoNeural',
        output_dir: path.join(__dirname, '../data/updated-tts-test'),
        format: 'mp3',
        sample_rate: 24000,
        enabled: true
      }
    }
  };
  
  // 确保输出目录存在
  const outputDir = config.services.tts.output_dir;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let ttsService = null;
  
  try {
    console.log('🔧 1. 创建TTS服务实例...');
    ttsService = new TtsService(config);
    
    console.log('🔄 2. 初始化服务...');
    await ttsService.initialize();
    
    if (!ttsService.isEnabled()) {
      throw new Error('TTS服务未能成功初始化');
    }
    
    console.log('✅ 3. TTS服务已就绪\n');
    
    // 测试基本功能
    console.log('🔊 4. 测试基本TTS合成功能...');
    const testText = '你好，这是更新后的TTS服务测试。';
    const audioData = await ttsService.synthesize(testText);
    
    console.log('✅ 基本合成功能测试通过');
    console.log(`📊 音频数据大小: ${audioData.length} bytes`);
    
    // 保存测试文件
    const testFile = path.join(outputDir, `updated-test-${Date.now()}.mp3`);
    fs.writeFileSync(testFile, audioData);
    console.log(`💾 测试文件已保存: ${testFile}`);
    
    // 测试语音列表功能
    console.log('\n🎤 5. 测试语音列表功能...');
    const voices = await ttsService.getAvailableVoices();
    console.log(`✅ 获取到 ${voices.length} 个可用语音`);
    console.log('前3个语音:');
    voices.slice(0, 3).forEach(voice => {
      console.log(`  - ${voice.shortName} (${voice.gender}, ${voice.locale})`);
    });
    
    // 测试不同语音
    console.log('\n🎭 6. 测试不同语音...');
    const yunxiVoice = 'zh-CN-YunxiNeural';
    ttsService.setVoice(yunxiVoice);
    const yunxiAudio = await ttsService.synthesize('这是云希语音的测试。');
    console.log(`✅ 云希语音合成成功，数据大小: ${yunxiAudio.length} bytes`);
    
    // 测试英语语音
    console.log('\n🇬🇧 7. 测试英语语音...');
    const englishVoice = 'en-US-EmmaMultilingualNeural';
    ttsService.setVoice(englishVoice);
    const englishAudio = await ttsService.synthesize('Hello, this is English TTS test.');
    console.log(`✅ 英语语音合成成功，数据大小: ${englishAudio.length} bytes`);
    
    console.log('\n🎉 所有测试完成!');
    console.log('✅ TTS服务更新成功并正常工作');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('📋 错误详情:', error.stack);
  } finally {
    // 清理资源
    if (ttsService) {
      await ttsService.destroy();
    }
  }
}

// 运行测试
testUpdatedTtsService();