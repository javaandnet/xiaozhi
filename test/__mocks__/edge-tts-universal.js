/**
 * edge-tts-universal 模拟模块
 */

// 模拟UniversalEdgeTTS类
class MockEdgeTTS {
  constructor(text, voice) {
    this.text = text;
    this.voice = voice;
  }
  
  async synthesize() {
    // 返回模拟的音频数据
    const mockAudio = Buffer.from('mock-audio-data-for-real-testing');
    return {
      audio: {
        arrayBuffer: async () => mockAudio.buffer
      },
      subtitle: []
    };
  }
}

// 模拟listVoices函数
async function listVoices() {
  return [
    { Name: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoxiaoNeural)', ShortName: 'zh-CN-XiaoxiaoNeural', Gender: 'Female', Locale: 'zh-CN' },
    { Name: 'Microsoft Server Speech Text to Speech Voice (zh-CN, YunxiNeural)', ShortName: 'zh-CN-YunxiNeural', Gender: 'Male', Locale: 'zh-CN' },
    { Name: 'Microsoft Server Speech Text to Speech Voice (zh-CN, YunyangNeural)', ShortName: 'zh-CN-YunyangNeural', Gender: 'Male', Locale: 'zh-CN' },
  ];
}

module.exports = {
  UniversalEdgeTTS: MockEdgeTTS,
  listVoices: listVoices
};
