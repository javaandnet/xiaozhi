#!/usr/bin/env node

/**
 * 简单的TTS测试 - 快速验证（ES模块版本）
 */

import { EdgeTTS } from 'edge-tts-universal';
import fs from 'fs';
import path from 'path';

async function simpleTtsTest() {
  console.log('🚀 开始简单TTS测试...');
  
  try {
    // 确保输出目录存在
    const outputDir = path.join(process.cwd(), 'data/tts-simple-test');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    console.log('🔊 正在生成音频...');
    
    // 创建TTS实例
    const tts = new EdgeTTS('你好，这是一个简单的TTS测试。', 'zh-CN-XiaoxiaoNeural');
    
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
    
    // 如果是网络超时错误，给出建议
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      console.log('\n💡 建议解决方案:');
      console.log('1. 检查网络连接');
      console.log('2. 尝试使用代理或VPN');
      console.log('3. 使用本地TTS服务作为备选方案');
      console.log('4. 稍后再试，可能是临时网络问题');
    }
  }
}

// 运行测试
simpleTtsTest();