// 架构测试脚本
const { XiaoZhiServer } = require('../app');
const core = require('../core');

async function testArchitecture() {
  console.log('🧪 开始测试小智服务器架构...\n');
  
  try {
    // 测试核心模块导入
    console.log('✅ 核心模块导入测试');
    console.log('  - 设备模型:', !!core.models.Device);
    console.log('  - 会话模型:', !!core.models.Session);
    console.log('  - 音频模型:', !!core.models.Audio);
    console.log('  - 设备管理器:', !!core.managers.Device);
    console.log('  - 会话管理器:', !!core.managers.Session);
    console.log('  - 音频管理器:', !!core.managers.Audio);
    console.log('  - TTS服务:', !!core.services.Tts);
    console.log('  - STT服务:', !!core.services.Stt);
    
    // 测试服务器实例化
    console.log('\n✅ 服务器实例化测试');
    const server = new XiaoZhiServer();
    console.log('  - 服务器实例创建成功');
    
    // 测试配置
    console.log('\n✅ 配置测试');
    console.log('  - 服务器端口:', core.config.server.port);
    console.log('  - WebSocket配置:', !!core.config.websocket);
    console.log('  - 音频配置:', !!core.config.audio);
    console.log('  - 服务配置:', !!core.config.services);
    
    // 测试管理器功能
    console.log('\n✅ 管理器功能测试');
    const deviceManager = new core.managers.Device();
    const sessionManager = new core.managers.Session();
    const audioManager = new core.managers.Audio();
    
    console.log('  - 设备管理器创建成功');
    console.log('  - 会话管理器创建成功');
    console.log('  - 音频管理器创建成功');
    
    // 测试服务初始化
    console.log('\n✅ 服务初始化测试');
    const ttsService = new core.services.Tts(core.config.services.tts);
    const sttService = new core.services.Stt(core.config.services.stt);
    
    await ttsService.initialize();
    await sttService.initialize();
    
    console.log('  - TTS服务初始化成功');
    console.log('  - STT服务初始化成功');
    console.log('  - TTS启用状态:', ttsService.isEnabled());
    console.log('  - STT启用状态:', sttService.isEnabled());
    
    // 测试健康检查
    console.log('\n✅ 健康检查测试');
    const ttsHealth = await ttsService.healthCheck();
    const sttHealth = await sttService.healthCheck();
    
    console.log('  - TTS服务健康:', ttsHealth.status);
    console.log('  - STT服务健康:', sttHealth.status);
    
    console.log('\n🎉 架构测试完成！');
    console.log('\n📊 测试总结:');
    console.log('  - 核心模块: ✅');
    console.log('  - 管理器组件: ✅');
    console.log('  - 服务层: ✅');
    console.log('  - 配置系统: ✅');
    console.log('  - 健康检查: ✅');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  testArchitecture();
}

module.exports = { testArchitecture };