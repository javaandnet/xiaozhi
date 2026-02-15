const { Communicate } = require('edge-tts-universal');

async function testEdgeTTS() {
  console.log('测试Edge TTS库...');
  
  try {
    const text = '你好世界';
    const tts = new Communicate(text, { voice: 'zh-CN-XiaoxiaoNeural' });
    
    console.log('开始流式处理...');
    const audioChunks = [];
    
    for await (const chunk of tts.stream()) {
      if (chunk.type === 'audio') {
        audioChunks.push(chunk.data);
        console.log(`收到音频块: ${chunk.data.length} 字节`);
      }
    }
    
    if (audioChunks.length > 0) {
      const finalBuffer = Buffer.concat(audioChunks);
      console.log(`✓ 成功生成音频，总大小: ${finalBuffer.length} 字节`);
    } else {
      console.log('✗ 未收到任何音频数据');
    }
    
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    console.error(error.stack);
  }
}

testEdgeTTS();