#!/usr/bin/env node

/**
 * 测试更新后的TTS服务 (ES模块版本)
 */

import { EdgeTTS } from 'node-edge-tts';
import fs from 'fs';
import path from 'path';

async function testUpdatedTtsDirect() {
  console.log('🧪 直接测试更新后的 node-edge-tts...');
  
  try {
    // 确保输出目录存在
    const outputDir = path.join(process.cwd(), 'data/updated-tts-direct-test');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    console.log('🔤 1. 测试基本中文TTS...');
    const tts1 = new EdgeTTS({
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: '+0%',
      volume: '+0%'
    });
    
    const chineseText = '你好，这是更新后的 node-edge-tts 库测试。';
    const chineseFile = path.join(outputDir, `chinese-test-${Date.now()}.mp3`);
    
    await tts1.ttsPromise(chineseText, chineseFile);
    const chineseStats = fs.statSync(chineseFile);
    console.log(`✅ 中文TTS成功: ${chineseStats.size} bytes`);
    
    console.log('\n🔤 2. 测试不同语音(云希)...');
    const tts2 = new EdgeTTS({
      voice: 'zh-CN-YunxiNeural',
      rate: '+0%',
      volume: '+0%'
    });
    
    const yunxiText = '这是云希语音的测试。';
    const yunxiFile = path.join(outputDir, `yunxi-test-${Date.now()}.mp3`);
    
    await tts2.ttsPromise(yunxiText, yunxiFile);
    const yunxiStats = fs.statSync(yunxiFile);
    console.log(`✅ 云希语音成功: ${yunxiStats.size} bytes`);
    
    console.log('\n🔤 3. 测试英语TTS...');
    const tts3 = new EdgeTTS({
      voice: 'en-US-EmmaMultilingualNeural',
      rate: '+0%',
      volume: '+0%'
    });
    
    const englishText = 'Hello, this is English TTS test with node-edge-tts library.';
    const englishFile = path.join(outputDir, `english-test-${Date.now()}.mp3`);
    
    await tts3.ttsPromise(englishText, englishFile);
    const englishStats = fs.statSync(englishFile);
    console.log(`✅ 英语TTS成功: ${englishStats.size} bytes`);
    
    console.log('\n🔤 4. 测试带参数的TTS...');
    const tts4 = new EdgeTTS({
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: '+20%',  // 加快速度
      volume: '+10%' // 增加音量
    });
    
    const fastText = '这是快速语音测试。';
    const fastFile = path.join(outputDir, `fast-test-${Date.now()}.mp3`);
    
    await tts4.ttsPromise(fastText, fastFile);
    const fastStats = fs.statSync(fastFile);
    console.log(`✅ 快速TTS成功: ${fastStats.size} bytes`);
    
    // 显示所有生成的文件
    console.log('\n📂 生成的测试文件:');
    const files = fs.readdirSync(outputDir);
    files.forEach(file => {
      const filePath = path.join(outputDir, file);
      const stats = fs.statSync(filePath);
      console.log(`  - ${file} (${stats.size} bytes)`);
    });
    
    console.log('\n🎉 所有测试完成!');
    console.log('✅ node-edge-tts 库工作正常');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('📋 错误详情:', error.stack);
  }
}

// 运行测试
testUpdatedTtsDirect();