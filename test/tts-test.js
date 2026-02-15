// TTS服务测试脚本
// 用于测试小智服务器的TTS文字转语音功能

const TtsService = require('../core/tts-service');
const config = require('../config');

async function testTtsInitialization() {
  console.log('\n=== TTS服务初始化测试 ===');
  try {
    const tts = new TtsService(config);
    await tts.initialize();
    console.log('✅ TTS服务初始化成功');
    console.log('  提供商:', tts.provider);
    console.log('  语音:', tts.voice);
    console.log('  启用状态:', tts.isEnabled());
    return tts;
  } catch (error) {
    console.log('❌ TTS服务初始化失败:', error.message);
    return null;
  }
}

async function testSynthesize(tts) {
  console.log('\n=== TTS语音合成测试 ===');
  try {
    const testCases = [
      '你好，我是小智',
      '今天天气真好！',
      '这是一个测试。测试标点分段功能。',
      'Hello, this is a test.',
    ];

    for (const text of testCases) {
      const startTime = Date.now();
      const audioData = await tts.synthesize(text);
      const elapsed = Date.now() - startTime;

      console.log(`✅ "${text.substring(0, 15)}..."`);
      console.log(`   音频大小: ${audioData.length} bytes`);
      console.log(`   耗时: ${elapsed}ms`);
    }

    return true;
  } catch (error) {
    console.log('❌ TTS语音合成失败:', error.message);
    return false;
  }
}

async function testSynthesizeWithOptions(tts) {
  console.log('\n=== TTS自定义语音测试 ===');
  try {
    // 测试不同的语音
    const voices = [
      'zh-CN-XiaoxiaoNeural',
      'zh-CN-YunxiNeural',
      'zh-CN-YunyangNeural',
    ];

    for (const voice of voices) {
      const audioData = await tts.synthesize('你好', { voice });
      console.log(`✅ 语音: ${voice}, 音频大小: ${audioData.length} bytes`);
    }

    return true;
  } catch (error) {
    console.log('❌ TTS自定义语音测试失败:', error.message);
    return false;
  }
}

async function testCleanMarkdown(tts) {
  console.log('\n=== Markdown清理测试 ===');
  try {
    const testCases = [
      { input: '**粗体**文字', expected: '粗体文字' },
      { input: '*斜体*文字', expected: '斜体文字' },
      { input: '# 标题\n\n段落', expected: '标题\n\n段落' },
      { input: '[链接](http://example.com)', expected: '链接' },
      { input: '`代码`文字', expected: '代码文字' },
    ];

    for (const { input, expected } of testCases) {
      const result = tts._cleanMarkdown(input);
      const pass = result === expected;
      console.log(`${pass ? '✅' : '❌'} "${input}" -> "${result}"`);
    }

    return true;
  } catch (error) {
    console.log('❌ Markdown清理测试失败:', error.message);
    return false;
  }
}

async function testSplitText(tts) {
  console.log('\n=== 文本分段测试 ===');
  try {
    const testCases = [
      { input: '第一句。第二句。第三句。', expected: 3 },
      { input: '你好，世界！今天天气很好？', expected: 3 },
      { input: '没有标点', expected: 1 },
    ];

    for (const { input, expected } of testCases) {
      const segments = tts._splitText(input);
      const pass = segments.length === expected;
      console.log(`${pass ? '✅' : '❌'} "${input}" -> ${segments.length} 段 (期望 ${expected})`);
    }

    return true;
  } catch (error) {
    console.log('❌ 文本分段测试失败:', error.message);
    return false;
  }
}

async function testGetAvailableVoices(tts) {
  console.log('\n=== 获取可用语音列表 ===');
  try {
    const voices = await tts.getAvailableVoices();
    console.log(`✅ 获取到 ${voices.length} 个语音`);

    // 显示前5个中文语音
    const chineseVoices = voices.filter(v => v.locale.startsWith('zh-')).slice(0, 5);
    console.log('\n中文语音示例:');
    for (const voice of chineseVoices) {
      console.log(`  - ${voice.shortName} (${voice.gender})`);
    }

    return true;
  } catch (error) {
    console.log('❌ 获取语音列表失败:', error.message);
    return false;
  }
}

async function testHealthCheck(tts) {
  console.log('\n=== TTS健康检查测试 ===');
  try {
    const health = await tts.healthCheck();
    console.log('✅ TTS健康检查通过:');
    console.log('  状态:', health.status);
    console.log('  提供商:', health.provider);
    console.log('  语音:', health.voice);
    console.log('  输出大小:', health.outputSize);
    return true;
  } catch (error) {
    console.log('❌ TTS健康检查失败:', error.message);
    return false;
  }
}

async function testStreamSynthesize(tts) {
  console.log('\n=== TTS流式合成测试 ===');
  try {
    const segments = [];
    
    await tts.synthesizeStream('第一句。第二句。第三句。', (data) => {
      segments.push({
        text: data.text,
        isFirst: data.isFirst,
        isLast: data.isLast,
        audioSize: data.audio.length
      });
    });

    console.log(`✅ 流式合成完成，共 ${segments.length} 段:`);
    for (const seg of segments) {
      console.log(`  - "${seg.text}" (${seg.audioSize} bytes, first: ${seg.isFirst}, last: ${seg.isLast})`);
    }

    return true;
  } catch (error) {
    console.log('❌ TTS流式合成测试失败:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 开始测试TTS服务...\n');
  console.log('========================================');

  let tts = null;

  // 初始化测试
  tts = await testTtsInitialization();
  if (!tts) {
    console.log('\n❌ TTS服务初始化失败，终止测试');
    return;
  }

  // 运行各项测试
  await testSynthesize(tts);
  await testSynthesizeWithOptions(tts);
  await testCleanMarkdown(tts);
  await testSplitText(tts);
  await testGetAvailableVoices(tts);
  await testHealthCheck(tts);
  await testStreamSynthesize(tts);

  // 清理
  await tts.destroy();

  console.log('\n========================================');
  console.log('🏁 TTS服务测试完成\n');
}

// 运行测试
if (require.main === module) {
  runAllTests().catch(err => {
    console.error('测试异常:', err);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testTtsInitialization,
  testSynthesize,
  testGetAvailableVoices,
  testHealthCheck
};
