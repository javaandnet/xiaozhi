/**
 * TTS服务单元测试
 */

const TtsService = require('../tts-service');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 测试配置
const mockConfig = {
  services: {
    tts: {
      provider: 'edge',
      voice: 'zh-CN-XiaoxiaoNeural',
      output_dir: path.join(os.tmpdir(), 'tts-test-real'),
      format: 'mp3',
      sample_rate: 24000
    }
  }
};

// 真实测试配置（不使用mock）
const realConfig = {
  services: {
    tts: {
      provider: 'edge',
      voice: 'zh-CN-XiaoxiaoNeural',
      output_dir: path.join(__dirname, '../../data/tts-output'),
      format: 'mp3',
      sample_rate: 24000,
      enabled: true
    }
  }
};

describe('TtsService', () => {
  let ttsService;
  let realTtsService;

  beforeEach(() => {
    ttsService = new TtsService(mockConfig);
  });

  afterEach(async () => {
    if (ttsService && ttsService.initialized) {
      await ttsService.destroy();
    }
    if (realTtsService && realTtsService.initialized) {
      await realTtsService.destroy();
    }
  });

  describe('构造函数', () => {
    test('应该正确初始化配置', () => {
      expect(ttsService.provider).toBe('edge');
      expect(ttsService.voice).toBe('zh-CN-XiaoxiaoNeural');
      expect(ttsService.audioFormat).toBe('mp3');
      expect(ttsService.sampleRate).toBe(24000);
    });

    test('应该使用默认配置', () => {
      const defaultTts = new TtsService({});
      expect(defaultTts.provider).toBe('edge');
      expect(defaultTts.voice).toBe('zh-CN-XiaoxiaoNeural');
    });

    test('应该设置标点符号', () => {
      expect(ttsService.punctuations).toContain('。');
      expect(ttsService.punctuations).toContain('？');
      expect(ttsService.firstSentencePunctuations).toContain('，');
    });
  });

  describe('_cleanMarkdown', () => {
    test('应该移除粗体标记', () => {
      const result = ttsService._cleanMarkdown('**粗体**文字');
      expect(result).toBe('粗体文字');
    });

    test('应该移除斜体标记', () => {
      const result = ttsService._cleanMarkdown('*斜体*文字');
      expect(result).toBe('斜体文字');
    });

    test('应该移除标题标记', () => {
      const result = ttsService._cleanMarkdown('# 标题\n\n段落');
      expect(result).toBe('标题\n\n段落');
    });

    test('应该移除链接但保留文字', () => {
      const result = ttsService._cleanMarkdown('[链接](http://example.com)');
      expect(result).toBe('链接');
    });

    test('应该移除代码块', () => {
      const result = ttsService._cleanMarkdown('`代码`文字');
      expect(result).toBe('文字');
    });

    test('应该减少多余换行', () => {
      const result = ttsService._cleanMarkdown('段落\n\n\n\n段落');
      expect(result).toBe('段落\n\n段落');
    });

    test('应该处理空字符串', () => {
      expect(ttsService._cleanMarkdown('')).toBe('');
      expect(ttsService._cleanMarkdown(null)).toBe('');
      expect(ttsService._cleanMarkdown(undefined)).toBe('');
    });
  });

  describe('_splitText', () => {
    test('应该按句号分割', () => {
      const result = ttsService._splitText('第一句。第二句。第三句。');
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('第一句。');
      expect(result[1]).toBe('第二句。');
      expect(result[2]).toBe('第三句。');
    });

    test('应该按问号分割', () => {
      const result = ttsService._splitText('你好吗？我很好。');
      expect(result).toHaveLength(2);
    });

    test('应该按感叹号分割', () => {
      const result = ttsService._splitText('太棒了！谢谢你！');
      expect(result).toHaveLength(2);
    });

    test('应该处理混合标点', () => {
      const result = ttsService._splitText('你好，世界！今天天气很好？');
      expect(result).toHaveLength(2);
    });

    test('应该处理没有标点的文本', () => {
      const result = ttsService._splitText('没有标点');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('没有标点');
    });

    test('应该处理空字符串', () => {
      expect(ttsService._splitText('')).toEqual([]);
      expect(ttsService._splitText(null)).toEqual([]);
    });
  });

  describe('generateFilename', () => {
    test('应该生成正确的文件名', () => {
      const filename = ttsService.generateFilename('.mp3');
      expect(filename).toContain('.mp3');
      expect(filename).toContain('tts-');
    });

    test('应该支持不同扩展名', () => {
      const wavFile = ttsService.generateFilename('.wav');
      const pcmFile = ttsService.generateFilename('.pcm');
      
      expect(wavFile).toContain('.wav');
      expect(pcmFile).toContain('.pcm');
    });
  });

  describe('setVoice', () => {
    test('应该设置语音', () => {
      ttsService.setVoice('zh-CN-YunxiNeural');
      expect(ttsService.voice).toBe('zh-CN-YunxiNeural');
    });
  });

  describe('setProvider', () => {
    test('应该设置提供商', () => {
      ttsService.setProvider('openai');
      expect(ttsService.provider).toBe('openai');
    });
  });

  describe('synthesize', () => {
    test('应该在未初始化时抛出错误', async () => {
      await expect(ttsService.synthesize('测试')).rejects.toThrow('未启用或未初始化');
    });

    test('应该在初始化后正常工作', async () => {
      // 跳过实际初始化，因为需要网络
      ttsService.initialized = true;
      ttsService.enabled = true;
      
      // 这个测试需要实际网络，可以标记为集成测试
    }, 30000);
  });

  // 实际的TTS测试用例 - 生成真实音频文件
  describe('实际TTS音频生成测试', () => {
    test('应该成功生成真实的中文音频文件', async () => {
      // 创建真实的TTS服务实例
      realTtsService = new TtsService(realConfig);
      
      // 初始化服务
      await realTtsService.initialize();
      expect(realTtsService.isEnabled()).toBe(true);
      
      // 测试文本
      const testText = '你好，这是一个TTS语音合成测试。';
      
      // 生成音频
      const audioData = await realTtsService.synthesize(testText);
      
      // 验证音频数据
      expect(audioData).toBeInstanceOf(Buffer);
      expect(audioData.length).toBeGreaterThan(0);
      
      // 生成文件名
      const filename = realTtsService.generateFilename('.mp3');
      console.log('生成的音频文件:', filename);
      
      // 保存音频文件
      fs.writeFileSync(filename, audioData);
      
      // 验证文件存在且大小合理
      expect(fs.existsSync(filename)).toBe(true);
      const stats = fs.statSync(filename);
      expect(stats.size).toBeGreaterThan(1000); // 至少1KB
      
      console.log(`✅ 成功生成音频文件: ${filename}`);
      console.log(`📊 文件大小: ${stats.size} bytes`);
      console.log(`📝 合成文本: "${testText}"`);
      
      // 清理测试文件
      // fs.unlinkSync(filename);
    }, 30000); // 30秒超时
    
    test('应该支持不同的语音', async () => {
      realTtsService = new TtsService(realConfig);
      await realTtsService.initialize();
      
      // 切换到不同的语音
      realTtsService.setVoice('zh-CN-YunxiNeural');
      
      const testText = '这是另一个语音的测试。';
      const audioData = await realTtsService.synthesize(testText);
      
      expect(audioData).toBeInstanceOf(Buffer);
      expect(audioData.length).toBeGreaterThan(0);
      
      const filename = realTtsService.generateFilename('-yunxi.mp3');
      fs.writeFileSync(filename, audioData);
      
      expect(fs.existsSync(filename)).toBe(true);
      const stats = fs.statSync(filename);
      expect(stats.size).toBeGreaterThan(1000);
      
      console.log(`✅ 成功生成不同语音的音频文件: ${filename}`);
      console.log(`📊 文件大小: ${stats.size} bytes`);
    }, 30000);
    
    test('应该支持流式合成', async () => {
      realTtsService = new TtsService(realConfig);
      await realTtsService.initialize();
      
      const testText = '这是一段较长的文本，用于测试流式合成功能。它包含多个句子，可以验证分段处理是否正常工作。';
      const receivedSegments = [];
      
      // 使用流式合成
      await realTtsService.synthesizeStream(testText, (segmentData) => {
        receivedSegments.push({
          text: segmentData.text,
          audioLength: segmentData.audio.length,
          isFirst: segmentData.isFirst,
          isLast: segmentData.isLast
        });
        
        // 保存每个片段
        const segmentFilename = realTtsService.generateFilename(`-segment-${receivedSegments.length}.mp3`);
        fs.writeFileSync(segmentFilename, segmentData.audio);
        console.log(`💾 保存片段 ${receivedSegments.length}: ${segmentFilename} (${segmentData.audio.length} bytes)`);
      });
      
      // 验证接收到了片段
      expect(receivedSegments.length).toBeGreaterThan(0);
      console.log(`📊 总共收到 ${receivedSegments.length} 个音频片段`);
      
      // 验证第一个和最后一个片段的标记
      expect(receivedSegments[0].isFirst).toBe(true);
      expect(receivedSegments[receivedSegments.length - 1].isLast).toBe(true);
      
      // 验证总音频长度
      const totalAudioLength = receivedSegments.reduce((sum, seg) => sum + seg.audioLength, 0);
      expect(totalAudioLength).toBeGreaterThan(0);
      
      console.log(`🎵 流式合成完成，总音频大小: ${totalAudioLength} bytes`);
    }, 45000); // 更长的超时时间
    
    test('应该能够获取可用的语音列表', async () => {
      realTtsService = new TtsService(realConfig);
      await realTtsService.initialize();
      
      const voices = await realTtsService.getAvailableVoices();
      
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      
      // 验证语音对象结构
      const firstVoice = voices[0];
      expect(firstVoice).toHaveProperty('name');
      expect(firstVoice).toHaveProperty('shortName');
      expect(firstVoice).toHaveProperty('gender');
      expect(firstVoice).toHaveProperty('locale');
      
      console.log(`🎤 可用语音数量: ${voices.length}`);
      console.log('🎙️  前三个语音:');
      voices.slice(0, 3).forEach((voice, index) => {
        console.log(`  ${index + 1}. ${voice.shortName} (${voice.gender}, ${voice.locale})`);
      });
    }, 15000);
    
    test('应该正确处理Markdown格式文本', async () => {
      realTtsService = new TtsService(realConfig);
      await realTtsService.initialize();
      
      // 包含各种Markdown格式的文本
      const markdownText = `# 标题

这是一个**粗体**文字和*斜体*文字的测试。

这里有一个[链接](http://example.com)和一些\`代码\`。

- 列表项1
- 列表项2

> 引用内容

最后是普通文字。`;
      
      const audioData = await realTtsService.synthesize(markdownText);
      
      expect(audioData).toBeInstanceOf(Buffer);
      expect(audioData.length).toBeGreaterThan(0);
      
      const filename = realTtsService.generateFilename('-markdown.mp3');
      fs.writeFileSync(filename, audioData);
      
      expect(fs.existsSync(filename)).toBe(true);
      const stats = fs.statSync(filename);
      expect(stats.size).toBeGreaterThan(1000);
      
      console.log(`✅ 成功处理Markdown格式文本: ${filename}`);
      console.log(`📊 文件大小: ${stats.size} bytes`);
    }, 30000);
  });

  describe('convertToOpus', () => {
    test('应该返回原始数据', async () => {
      const audioData = Buffer.from('mock audio data');
      const result = await ttsService.convertToOpus(audioData);
      expect(result).toEqual(audioData);
    });
  });

  describe('BaseService继承', () => {
    test('应该继承BaseService', () => {
      expect(ttsService.name).toBe('TTS');
      expect(ttsService.isEnabled()).toBe(false);
    });

    test('应该正确处理enabled状态', () => {
      ttsService.enabled = true;
      ttsService.initialized = true;
      expect(ttsService.isEnabled()).toBe(true);
    });
  });
});
