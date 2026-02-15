import { EdgeTTS } from 'edge-tts-universal';
import fs from 'fs/promises';

async function main() {
  console.log('🚀 开始TTS测试...');

  try {
    console.log('🔤 创建TTS实例...');
    // Simple one-shot synthesis
    const tts = new EdgeTTS('Hello, world!', 'en-US-EmmaMultilingualNeural');

    console.log('🔊 正在生成音频...');
    const result = await tts.synthesize();

    console.log('💾 保存音频文件...');
    // Save audio file
    const audioBuffer = Buffer.from(await result.audio.arrayBuffer());
    await fs.writeFile('output.mp3', audioBuffer);

    console.log('✅ 音频文件生成成功: output.mp3');
    console.log(`📊 文件大小: ${audioBuffer.length} bytes`);
  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error('📝 错误详情:', error);
  }
}

main();