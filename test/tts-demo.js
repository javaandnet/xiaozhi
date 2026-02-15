#!/usr/bin/env node

/**
 * TTS服务实际使用演示
 * 展示如何生成真实的音频文件（当网络可用时）
 */

const TtsService = require('../core/tts-service');
const fs = require('fs');
const path = require('path');

async function demonstrateRealTts() {
  console.log('🎯 TTS服务实际使用演示\n');
  console.log('注意: 此演示需要网络连接到微软Edge TTS服务');
  console.log('如果遇到连接超时，请检查网络环境或稍后重试\n');
  
  // 配置
  const config = {
    services: {
      tts: {
        provider: 'edge',
        voice: 'zh-CN-XiaoxiaoNeural',
        output_dir: path.join(__dirname, '../data/tts-demo'),
        format: 'mp3',
        sample_rate: 24000,
        enabled: true
      }
    }
  };

  // 创建输出目录
  const outputDir = config.services.tts.output_dir;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let ttsService = null;
  
  try {
    console.log('🔧 1. 初始化TTS服务...');
    ttsService = new TtsService(config);
    
    console.log('🔄 2. 正在连接到Edge TTS服务...');
    console.time('初始化耗时');
    
    await ttsService.initialize();
    
    console.timeEnd('初始化耗时');
    
    if (!ttsService.isEnabled()) {
      throw new Error('TTS服务未能成功初始化');
    }
    
    console.log('✅ 3. TTS服务已就绪\n');
    
    // 演示不同类型的内容
    const demos = [
      {
        name: '基础文本',
        text: '欢迎使用小智TTS服务，这是一个真实的语音合成演示。',
        filename: 'demo-basic'
      },
      {
        name: '不同语音',
        text: '现在切换到云希语音进行演示。',
        filename: 'demo-yunxi',
        voice: 'zh-CN-YunxiNeural'
      },
      {
        name: '较长文本',
        text: '这是一段较长的文本演示。语音合成技术可以让计算机将文字转换为自然流畅的语音输出。这项技术在智能助手、有声读物、导航系统等领域都有广泛应用。',
        filename: 'demo-long'
      }
    ];
    
    console.log('🔊 4. 开始生成音频文件...\n');
    
    for (let i = 0; i < demos.length; i++) {
      const demo = demos[i];
      console.log(`🔸 演示 ${i + 1}/${demos.length}: ${demo.name}`);
      
      // 如果指定了不同的语音，则切换
      if (demo.voice) {
        ttsService.setVoice(demo.voice);
        console.log(`   切换到语音: ${demo.voice}`);
      }
      
      console.time(`${demo.name}生成耗时`);
      
      try {
        // 生成音频
        const audioData = await ttsService.synthesize(demo.text);
        
        // 保存文件
        const filepath = path.join(outputDir, `${demo.filename}.mp3`);
        fs.writeFileSync(filepath, audioData);
        
        // 获取文件信息
        const stats = fs.statSync(filepath);
        
        console.timeEnd(`${demo.name}生成耗时`);
        console.log(`   ✅ 文件已生成: ${filepath}`);
        console.log(`   📊 文件大小: ${stats.size} bytes`);
        console.log(`   📝 合成文本: "${demo.text.substring(0, 30)}${demo.text.length > 30 ? '...' : ''}"`);
        console.log();
        
      } catch (error) {
        console.timeEnd(`${demo.name}生成耗时`);
        console.log(`   ❌ 生成失败: ${error.message}`);
        console.log();
      }
    }
    
    // 演示流式合成
    console.log('🌊 5. 演示流式合成...');
    const streamText = '这是流式合成演示。系统将把这段长文本分成多个片段分别合成，然后依次返回音频数据。这种方式适合处理大段文本或实时语音输出场景。';
    const segments = [];
    
    console.time('流式合成耗时');
    
    await ttsService.synthesizeStream(streamText, (segmentData) => {
      segments.push({
        text: segmentData.text,
        size: segmentData.audio.length
      });
      
      const segmentFile = path.join(outputDir, `demo-stream-${segments.length}.mp3`);
      fs.writeFileSync(segmentFile, segmentData.audio);
      console.log(`   💾 片段 ${segments.length}: ${segmentFile} (${segmentData.audio.length} bytes)`);
    });
    
    console.timeEnd('流式合成耗时');
    console.log(`   📊 总共生成 ${segments.length} 个片段`);
    console.log(`   🎵 总音频大小: ${segments.reduce((sum, seg) => sum + seg.size, 0)} bytes\n`);
    
    // 显示生成的文件
    console.log('📁 6. 生成的音频文件列表:');
    const files = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.mp3'))
      .sort();
    
    files.forEach((file, index) => {
      const filepath = path.join(outputDir, file);
      const stats = fs.statSync(filepath);
      console.log(`   ${index + 1}. ${file} (${stats.size} bytes)`);
    });
    
    console.log(`\n🎉 演示完成! 共生成 ${files.length} 个音频文件`);
    console.log(`📂 文件位置: ${outputDir}`);
    
  } catch (error) {
    console.error('\n❌ 演示过程中出现错误:');
    console.error(`   ${error.message}`);
    
    if (error.message.includes('timeout') || error.message.includes('network')) {
      console.log('\n💡 解决建议:');
      console.log('   1. 检查网络连接是否正常');
      console.log('   2. 确认可以访问微软服务');
      console.log('   3. 如果在受限网络环境，可能需要配置代理');
      console.log('   4. 稍后重试，服务可能暂时不可用');
    }
  } finally {
    // 清理资源
    if (ttsService) {
      try {
        console.log('\n🧹 正在清理资源...');
        await ttsService.destroy();
        console.log('✅ 清理完成');
      } catch (error) {
        console.log('⚠️  清理时出现警告:', error.message);
      }
    }
  }
}

// 添加优雅退出处理
process.on('SIGINT', () => {
  console.log('\n\n👋 收到中断信号，正在退出...');
  process.exit(0);
});

// 运行演示
if (require.main === module) {
  demonstrateRealTts().catch(error => {
    console.error('程序异常退出:', error);
    process.exit(1);
  });
}

module.exports = { demonstrateRealTts };