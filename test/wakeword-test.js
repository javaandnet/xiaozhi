const core = require('../core');

async function testWakeWordDetection() {
  console.log('=== 唤醒词检测功能测试 ===\n');
  
  try {
    // 创建唤醒词服务实例
    const wakeWordService = new core.services.WakeWord({
      keywords: ['小智', '你好小智', 'Hey XiaoZhi'],
      sensitivity: 0.7,
      minConfidence: 0.6
    });
    
    // 初始化服务
    await wakeWordService.initialize();
    console.log('✓ 唤醒词服务初始化成功\n');
    
    // 测试健康检查
    const healthStatus = await wakeWordService.healthCheck();
    console.log('健康检查结果:', healthStatus);
    console.log('');
    
    // 测试唤醒词检测
    console.log('--- 测试唤醒词检测 ---');
    
    // 模拟包含唤醒词的音频数据
    const wakeWordAudio = Buffer.from('你好小智，今天天气怎么样？');
    const normalAudio = Buffer.from('今天的天气很好，适合外出活动。');
    
    // 检测包含唤醒词的音频
    const result1 = await wakeWordService.detect(wakeWordAudio);
    console.log('包含唤醒词的音频检测结果:');
    console.log('  检测到唤醒词:', result1.detected);
    console.log('  唤醒词:', result1.keyword);
    console.log('  置信度:', result1.confidence.toFixed(2));
    console.log('  时间戳:', new Date(result1.timestamp).toLocaleString());
    console.log('');
    
    // 检测普通音频
    const result2 = await wakeWordService.detect(normalAudio);
    console.log('普通音频检测结果:');
    console.log('  检测到唤醒词:', result2.detected);
    console.log('  唤醒词:', result2.keyword);
    console.log('  置信度:', result2.confidence.toFixed(2));
    console.log('');
    
    // 测试唤醒词管理功能
    console.log('--- 测试唤醒词管理 ---');
    
    console.log('当前唤醒词列表:', wakeWordService.getKeywords());
    
    // 添加新唤醒词
    wakeWordService.addKeyword('小爱同学');
    console.log('添加唤醒词后:', wakeWordService.getKeywords());
    
    // 移除唤醒词
    wakeWordService.removeKeyword('Hey XiaoZhi');
    console.log('移除唤醒词后:', wakeWordService.getKeywords());
    
    console.log('');
    
    // 测试敏感度设置
    console.log('--- 测试敏感度设置 ---');
    console.log('当前敏感度:', wakeWordService.sensitivity);
    wakeWordService.setSensitivity(0.9);
    console.log('设置后敏感度:', wakeWordService.sensitivity);
    console.log('');
    
    // 测试回调功能
    console.log('--- 测试回调功能 ---');
    wakeWordService.setWakeWordCallback((result) => {
      console.log('>>> 唤醒词回调被触发 <<<');
      console.log('  检测到:', result.keyword);
      console.log('  置信度:', result.confidence);
    });
    
    // 再次检测触发回调
    await wakeWordService.detect(wakeWordAudio);
    console.log('');
    
    // 测试语言支持
    console.log('--- 测试语言支持 ---');
    const languages = wakeWordService.getSupportedLanguages();
    console.log('支持的语言:');
    languages.forEach(lang => {
      console.log(`  ${lang.code}: ${lang.name} (${lang.dialect})`);
    });
    console.log('');
    
    // 清理资源
    await wakeWordService.destroy();
    console.log('✓ 唤醒词服务测试完成\n');
    
  } catch (error) {
    console.error('✗ 唤醒词检测测试失败:', error.message);
    console.error(error.stack);
  }
}

async function testIntegratedWakeWordWithSTT() {
  console.log('=== STT集成唤醒词检测测试 ===\n');
  
  try {
    // 创建STT服务实例（启用唤醒词检测）
    const sttService = new core.services.Stt({
      provider: 'funasr',
      enableWakeWordDetection: true,
      wakeWords: ['小智', '你好小智']
    });
    
    // 初始化服务
    await sttService.initialize();
    console.log('✓ STT服务初始化成功\n');
    
    // 设置唤醒词回调
    sttService.setWakeWordCallback((result) => {
      console.log('>>> STT唤醒词回调 <<<');
      console.log('  关键词:', result.keyword);
      console.log('  置信度:', result.confidence);
      console.log('  时间戳:', new Date(result.timestamp).toLocaleString());
    });
    
    // 测试带有唤醒词的音频识别
    console.log('--- 测试STT中的唤醒词检测 ---');
    const wakeWordAudio = Buffer.from('你好小智，帮我查一下天气');
    
    const recognitionResult = await sttService.recognize(wakeWordAudio, {
      enableWakeWordDetection: true
    });
    
    console.log('STT识别结果:');
    console.log('  文本:', recognitionResult.text);
    console.log('  是否为唤醒词:', recognitionResult.isWakeWord || false);
    console.log('  唤醒词:', recognitionResult.keyword || '无');
    console.log('  置信度:', recognitionResult.confidence);
    console.log('  提供商:', recognitionResult.provider);
    console.log('');
    
    // 测试普通音频识别
    const normalAudio = Buffer.from('今天天气不错');
    const normalResult = await sttService.recognize(normalAudio);
    console.log('普通音频识别结果:');
    console.log('  文本:', normalResult.text);
    console.log('  是否为唤醒词:', normalResult.isWakeWord || false);
    console.log('');
    
    // 清理资源
    await sttService.destroy();
    console.log('✓ STT集成测试完成\n');
    
  } catch (error) {
    console.error('✗ STT集成测试失败:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
async function runAllTests() {
  await testWakeWordDetection();
  await testIntegratedWakeWordWithSTT();
  
  console.log('=== 所有测试完成 ===');
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testWakeWordDetection,
  testIntegratedWakeWordWithSTT,
  runAllTests
};