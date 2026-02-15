#!/usr/bin/env node

/**
 * 使用 node-edge-tts 库进行TTS测试
 */

import fs from 'fs';
import { EdgeTTS } from 'node-edge-tts';
import path from 'path';

async function testNodeEdgeTTS() {
    console.log('🚀 开始 node-edge-tts 测试...');

    try {
        // 确保输出目录存在
        const outputDir = path.join(process.cwd(), 'data/node-edge-tts-output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        console.log('🔤 创建TTS实例...');
        // 创建TTS实例
        const tts = new EdgeTTS({
            voice: 'zh-CN-XiaoxiaoNeural',
            rate: '+0%',
            volume: '+0%'
        });

        const text = "你好，这是使用 node-edge-tts 库生成的语音测试。";
        const filename = path.join(outputDir, `node-edge-tts-${Date.now()}.mp3`);

        console.log('🔤 合成文本:', text);
        console.log('💾 输出文件:', filename);

        console.log('🔊 正在生成音频...');
        // 使用正确的API方法
        await tts.ttsPromise(text, filename);

        // 验证结果
        if (fs.existsSync(filename)) {
            const stats = fs.statSync(filename);

            console.log('✅ TTS生成成功!');
            console.log(`📁 文件: ${filename}`);
            console.log(`📊 文件大小: ${stats.size} bytes`);
            console.log(`🎵 预估时长: 约 ${(stats.size / 1000).toFixed(1)} 秒`);

            // 检查是否有字幕文件
            const subtitleFile = filename.replace('.mp3', '.json');
            if (fs.existsSync(subtitleFile)) {
                console.log('📝 字幕文件已生成');
                const subtitleContent = fs.readFileSync(subtitleFile, 'utf8');
                const subtitles = JSON.parse(subtitleContent);
                console.log(`📊 字幕条目数: ${subtitles.length}`);
            }

            // 显示目录内容
            const files = fs.readdirSync(outputDir);
            console.log(`\n📂 输出目录文件 (${files.length} 个):`);
            files.forEach(file => {
                const filePath = path.join(outputDir, file);
                const fileStats = fs.statSync(filePath);
                console.log(`  - ${file} (${fileStats.size} bytes)`);
            });
        } else {
            console.log('❌ 音频文件未生成');
        }

    } catch (error) {
        console.error('❌ TTS测试失败:');
        console.error('📝 错误信息:', error.message);
        console.error('📋 错误堆栈:', error.stack);

        // 提供详细的错误诊断
        if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
            console.log('\n💡 网络连接问题诊断:');
            console.log('1. 检查网络连接状态');
            console.log('2. 尝试使用代理或VPN');
            console.log('3. 确认可以访问微软服务');
            console.log('4. 稍后再试，可能是临时网络波动');
        } else if (error.message.includes('voice') || error.message.includes('Voice')) {
            console.log('\n💡 语音配置问题:');
            console.log('1. 检查语音名称是否正确');
            console.log('2. 尝试其他可用语音');
        }
    }
}

// 运行测试
testNodeEdgeTTS();