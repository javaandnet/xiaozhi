import { EdgeTTS } from 'edge-tts-universal';

async function testEdgeTTS() {
  console.log('🚀 测试Edge TTS连接...');
  
  try {
    console.log('🔤 创建TTS实例...');
    const tts = new EdgeTTS('测试', 'zh-CN-XiaoxiaoNeural');
    
    console.log('⏱️ 设置5秒超时...');
    // 添加超时机制
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 5000);
    });
    
    console.log('🔊 发送TTS请求...');
    const resultPromise = tts.synthesize();
    
    // 等待任一Promise完成
    const result = await Promise.race([resultPromise, timeoutPromise]);
    
    console.log('✅ TTS请求成功!');
    console.log('📄 结果类型:', typeof result);
    console.log('🔑 结果属性:', Object.keys(result));
    
    if (result && result.audio) {
      console.log('🎵 音频对象存在');
      const arrayBuffer = await result.audio.arrayBuffer();
      console.log('📊 音频大小:', arrayBuffer.byteLength, 'bytes');
    }
    
  } catch (error) {
    console.error('❌ TTS测试失败:');
    console.error('📝 错误信息:', error.message);
    console.error('📋 错误堆栈:', error.stack);
  }
}

testEdgeTTS();