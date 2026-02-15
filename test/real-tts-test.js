#!/usr/bin/env node

/**
 * 实际TTS服务测试 - 生成真实音频文件
 * 这个脚本绕过Jest的mock配置，直接测试真实的TTS功能
 */

const TtsService = require('../core/tts-service');
const fs = require('fs');
const path = require('path');

async function runRealTtsTests() {
  console.log('🚀 开始实际TTS测试...\n');
  
  // 配置真实的TTS服务
  const realConfig = {
    services: {
      tts: {
        provider: 'edge',
        voice: 'zh-CN-XiaoxiaoNeural',
        output_dir: path.join(__dirname, '../data/tts-real-output'),
        format: 'mp3',
        sample_rate: 24000,
        enabled: true
      }
    }
  };

  // 确保输出目录存在
  const outputDir = realConfig.services.tts.output_dir;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let ttsService;
  const testResults = [];

  try {
    // 创建TTS服务实例
    console.log('🔧 创建TTS服务实例...');
    ttsService = new TtsService(realConfig);
    
    // 初始化服务
    console.log('🔄 初始化TTS服务...');
    await ttsService.initialize();
    
    if (!ttsService.isEnabled()) {
      throw new Error('TTS服务初始化失败');
    }
    
    console.log('✅ TTS服务初始化成功\n');

    // 测试1: 基本文本合成
    console.log('📝 测试1: 基本文本合成');
    const testText1 = '你好，这是一个真实的TTS语音合成测试。';
    const audioData1 = await ttsService.synthesize(testText1);
    
    const filename1 = ttsService.generateFilename('-basic.mp3');
    fs.writeFileSync(filename1, audioData1);
    
    const stats1 = fs.statSync(filename1);
    console.log(`  ✅ 生成文件: ${path.basename(filename1)}`);
    console.log(`  📊 文件大小: ${stats1.size} bytes`);
    console.log(`  📝 合成文本: "${testText1}"\n`);
    
    testResults.push({
      test: '基本文本合成',
      success: true,
      filename: filename1,
      size: stats1.size,
      text: testText1
    });

    // 测试2: 不同语音
    console.log('🗣️  测试2: 不同语音合成');
    ttsService.setVoice('zh-CN-YunxiNeural');
    
    const testText2 = '这是使用不同语音的测试。';
    const audioData2 = await ttsService.synthesize(testText2);
    
    const filename2 = ttsService.generateFilename('-yunxi.mp3');
    fs.writeFileSync(filename2, audioData2);
    
    const stats2 = fs.statSync(filename2);
    console.log(`  ✅ 生成文件: ${path.basename(filename2)}`);
    console.log(`  📊 文件大小: ${stats2.size} bytes`);
    console.log(`  📝 合成文本: "${testText2}"\n`);
    
    testResults.push({
      test: '不同语音合成',
      success: true,
      filename: filename2,
      size: stats2.size,
      text: testText2
    });

    // 测试3: 流式合成
    console.log('🌊 测试3: 流式合成');
    const streamText = '这是一段较长的文本，用于测试流式合成功能。它包含多个句子，可以验证分段处理是否正常工作。';
    const segments = [];
    
    await ttsService.synthesizeStream(streamText, (segmentData) => {
      segments.push({
        text: segmentData.text,
        audioLength: segmentData.audio.length,
        isFirst: segmentData.isFirst,
        isLast: segmentData.isLast
      });
      
      const segmentFilename = ttsService.generateFilename(`-stream-${segments.length}.mp3`);
      fs.writeFileSync(segmentFilename, segmentData.audio);
      console.log(`  💾 保存片段 ${segments.length}: ${path.basename(segmentFilename)} (${segmentData.audio.length} bytes)`);
    });
    
    const totalSize = segments.reduce((sum, seg) => sum + seg.audioLength, 0);
    console.log(`  📊 总共生成 ${segments.length} 个片段`);
    console.log(`  🎵 总音频大小: ${totalSize} bytes\n`);
    
    testResults.push({
      test: '流式合成',
      success: true,
      segments: segments.length,
      totalSize: totalSize,
      text: streamText
    });

    // 测试4: Markdown格式处理
    console.log('📄 测试4: Markdown格式文本处理');
    const markdownText = `# 标题测试
    
这是一个**粗体**文字和*斜体*文字的测试。
    
这里有一个[链接](http://example.com)和一些\`代码\`。
    
- 列表项1
- 列表项2
    
最后是普通文字。`;
    
    const audioData4 = await ttsService.synthesize(markdownText);
    const filename4 = ttsService.generateFilename('-markdown.mp3');
    fs.writeFileSync(filename4, audioData4);
    
    const stats4 = fs.statSync(filename4);
    console.log(`  ✅ 生成文件: ${path.basename(filename4)}`);
    console.log(`  📊 文件大小: ${stats4.size} bytes\n`);
    
    testResults.push({
      test: 'Markdown格式处理',
      success: true,
      filename: filename4,
      size: stats4.size
    });

    // 测试5: 获取语音列表
    console.log('🎤 测试5: 获取可用语音列表');
    const voices = await ttsService.getAvailableVoices();
    console.log(`  ✅ 找到 ${voices.length} 个可用语音`);
    console.log('  🎙️  前5个语音:');
    voices.slice(0, 5).forEach((voice, index) => {
      console.log(`    ${index + 1}. ${voice.shortName} (${voice.gender}, ${voice.locale})`);
    });
    console.log();

    testResults.push({
      test: '获取语音列表',
      success: true,
      voiceCount: voices.length
    });

    // 测试6: 健康检查
    console.log('🏥 测试6: 服务健康检查');
    const healthStatus = await ttsService.healthCheck();
    console.log(`  ✅ 健康状态: ${JSON.stringify(healthStatus)}\n`);
    
    testResults.push({
      test: '健康检查',
      success: true,
      status: healthStatus
    });

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    console.error(error.stack);
    testResults.push({
      test: '整体测试',
      success: false,
      error: error.message
    });
  } finally {
    // 清理服务
    if (ttsService) {
      try {
        await ttsService.destroy();
        console.log('🧹 TTS服务已清理');
      } catch (error) {
        console.error('⚠️  清理服务时出错:', error.message);
      }
    }
  }

  // 输出测试总结
  console.log('\n📋 测试结果总结:');
  console.log('===================');
  const successfulTests = testResults.filter(r => r.success).length;
  const totalTests = testResults.length;
  
  testResults.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} 测试 ${index + 1}: ${result.test}`);
    if (result.filename) {
      console.log(`   文件: ${path.basename(result.filename)} (${result.size} bytes)`);
    }
    if (result.segments) {
      console.log(`   片段数: ${result.segments}, 总大小: ${result.totalSize} bytes`);
    }
  });
  
  console.log(`\n📊 总结: ${successfulTests}/${totalTests} 个测试通过`);
  
  if (successfulTests === totalTests) {
    console.log('🎉 所有测试都成功通过！');
    console.log(`📁 音频文件保存在: ${outputDir}`);
  } else {
    console.log('⚠️  部分测试失败，请检查上面的错误信息');
  }
}

// 运行测试
if (require.main === module) {
  runRealTtsTests().catch(console.error);
}

module.exports = { runRealTtsTests };