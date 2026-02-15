#!/usr/bin/env node

/**
 * 简单的TTS测试 - 快速验证
 */

const { UniversalEdgeTTS } = require('edge-tts-universal');
const fs = require('fs');
const path = require('path');

async function simpleTtsTest() {
  console.log('🚀 开始简单TTS测试...');
  
  try {
    // 确保输出目录存在
    const outputDir = path.join(__dirname, '../data/tts-simple-test');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    console.log('🔊 正在生成音频...');
    
    // 创建TTS实例
    const tts = new UniversalEdgeTTS('你好，这是一个简单的TTS测试。', 'zh-CN-XiaoxiaoNeural');
    
    // 生成音频
    const result = await tts.synthesize();
    
    // 转换为buffer
    const arrayBuffer = await result.audio.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    
    // 保存文件
    const filename = path.join(outputDir, `test-${Date.now()}.mp3`);
    fs.writeFileSync(filename, audioBuffer);
    
    // 验证结果
    const stats = fs.statSync(filename);
    
    console.log('✅ 测试成功!');
    console.log(`📁 文件: ${filename}`);
    console.log(`📊 大小: ${stats.size} bytes`);
    console.log(`🎵 音频时长: 约 ${(stats.size / 1000).toFixed(1)} 秒`);
    
    // 列出目录中的文件
    const files = fs.readdirSync(outputDir);
    console.log(`\n📂 输出目录中的文件 (${files.length} 个):`);
    files.forEach(file => {
      const filePath = path.join(outputDir, file);
      const fileStats = fs.statSync(filePath);
      console.log(`  - ${file} (${fileStats.size} bytes)`);
    });
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
simpleTtsTest().catch(console.error);