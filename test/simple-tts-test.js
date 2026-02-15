const config = require('../config');
const TtsService = require('../core/tts-service');
const { logger } = require('../utils/logger');

async function testTtsService() {
  console.log('开始测试TTS服务...');
  
  try {
    // 创建TTS服务实例
    const ttsService = new TtsService(config);
    
    // 初始化服务
    await ttsService.initialize();
    console.log('✓ TTS服务初始化成功');
    
    // 测试文本合成
    const testText = '你好，这是一个TTS测试。';
    console.log(`测试文本: ${testText}`);
    
    const audioData = await ttsService.synthesize(testText);
    console.log(`✓ 音频生成成功，大小: ${audioData.length} 字节`);
    
    // 测试健康检查
    const healthStatus = await ttsService.healthCheck();
    console.log('✓ 健康检查通过:', healthStatus);
    
    console.log('\n🎉 所有测试通过！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
if (require.main === module) {
  testTtsService();
}

module.exports = { testTtsService };