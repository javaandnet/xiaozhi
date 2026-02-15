console.log('🎙️ 系统TTS快速测试');

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  const outputDir = path.join(__dirname, '../data/system-tts-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filename = path.join(outputDir, `quick-test-${Date.now()}.aiff`);
  
  console.log('🔤 执行系统TTS命令...');
  execSync(`say -v Ting-Ting -o "${filename}" "你好，系统TTS测试成功"`);
  
  console.log('✅ 系统TTS执行完成');
  
  if (fs.existsSync(filename)) {
    const stats = fs.statSync(filename);
    console.log(`📁 文件已生成: ${filename}`);
    console.log(`📊 文件大小: ${stats.size} bytes`);
  } else {
    console.log('❌ 文件未找到');
  }
  
} catch (error) {
  console.error('❌ 系统TTS测试失败:', error.message);
}