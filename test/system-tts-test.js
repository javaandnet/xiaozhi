#!/usr/bin/env node

/**
 * 使用系统TTS进行测试（macOS系统语音）
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function systemTtsTest() {
  console.log('🎙️ 开始系统TTS测试...');
  
  try {
    // 确保输出目录存在
    const outputDir = path.join(process.cwd(), 'data/system-tts-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const text = "你好，这是使用系统TTS生成的语音测试。";
    const filename = path.join(outputDir, `system-tts-${Date.now()}.aiff`);
    
    console.log('🔤 文本内容:', text);
    console.log('💾 输出文件:', filename);
    
    // 使用macOS系统say命令
    const sayProcess = spawn('say', [
      '-v', 'Ting-Ting',  // 中文语音
      '-o', filename,     // 输出文件
      text
    ]);
    
    // 监听进程事件
    sayProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ 系统TTS生成成功!');
        
        // 检查文件
        if (fs.existsSync(filename)) {
          const stats = fs.statSync(filename);
          console.log(`📁 文件大小: ${stats.size} bytes`);
          console.log(`🎵 音频格式: AIFF`);
          
          // 尝试播放文件
          console.log('▶️ 尝试播放音频...');
          const playProcess = spawn('afplay', [filename]);
          
          playProcess.on('close', (playCode) => {
            if (playCode === 0) {
              console.log('✅ 音频播放完成');
            } else {
              console.log('⚠️ 音频播放失败或被中断');
            }
          });
        } else {
          console.log('❌ 文件未生成');
        }
      } else {
        console.log('❌ 系统TTS生成失败，退出码:', code);
      }
    });
    
    sayProcess.on('error', (error) => {
      console.error('❌ 系统TTS命令执行错误:', error.message);
      console.log('💡 请确保在macOS系统上运行此脚本');
    });
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
  }
}

// 运行测试
systemTtsTest();