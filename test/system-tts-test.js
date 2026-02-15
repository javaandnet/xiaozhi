const config = require('../config');
const TtsService = require('../core/tts-service');
const { logger } = require('../utils/logger');

async function testSystemTts() {
  console.log('开始测试系统TTS...');
  
  try {
    // 创建TTS服务实例，强制使用系统TTS
    const ttsConfig = {
      ...config,
      services: {
        ...config.services,
        tts: {
          provider: 'system',
          voice: 'Ting-Ting'
        }
      }
    };
    
    const ttsService = new TtsService(ttsConfig);
    
    // 初始化服务
    await ttsService.initialize();
    console.log('✓ TTS服务初始化成功');
    
    // 测试文本合成
    const testText = '你好，这是系统TTS测试。';
    console.log(`测试文本: ${testText}`);
    
    const startTime = Date.now();
    const audioData = await ttsService.synthesize(testText);
    const duration = Date.now() - startTime;
    
    console.log(`✓ 音频生成成功，大小: ${audioData.length} 字节，耗时: ${duration}ms`);
    
    // 保存测试文件
    const fs = require('fs');
    const testFile = './data/tts-output/system-test.aiff';
    fs.writeFileSync(testFile, audioData);
    console.log(`✓ 音频已保存到: ${testFile}`);
    
    console.log('\n🎉 系统TTS测试通过！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
if (require.main === module) {
  testSystemTts();
}

module.exports = { testSystemTts };