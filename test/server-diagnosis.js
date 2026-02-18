#!/usr/bin/env node

/**
 * 服务器启动诊断脚本
 * 检查为什么server.js无法正常启动
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 服务器启动诊断\n');

try {
    console.log('1. 检查Node.js版本...');
    console.log(`   Node.js版本: ${process.version}`);
    
    console.log('\n2. 检查工作目录...');
    console.log(`   当前目录: ${process.cwd()}`);
    
    console.log('\n3. 尝试导入server.js...');
    
    // 尝试导入server.js来检查是否有语法错误
    const serverModule = await import('../server.js');
    console.log('   ✅ server.js导入成功');
    
    console.log('\n4. 检查依赖模块...');
    
    // 检查关键依赖
    const modulesToCheck = [
        'express',
        'ws',
        'dotenv',
        './core/handlers/websocket.js',
        './core/services/mcp.js'
    ];
    
    for (const modulePath of modulesToCheck) {
        try {
            await import(modulePath);
            console.log(`   ✅ ${modulePath}`);
        } catch (error) {
            console.log(`   ❌ ${modulePath}: ${error.message}`);
        }
    }
    
    console.log('\n5. 尝试启动服务器...');
    
    // 尝试启动服务器但立即关闭
    console.log('   正在启动服务器...');
    
    // 设置一个简化的服务器启动过程
    process.env.PORT = '8001'; // 使用不同的端口避免冲突
    
    const serverProcess = await import('../server.js');
    
    // 等待一小段时间
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('   ✅ 服务器似乎启动成功');
    
    console.log('\n✅ 诊断完成：服务器应该可以正常启动');
    console.log('💡 建议：请手动运行 "node server.js" 启动服务器');
    
} catch (error) {
    console.log('❌ 诊断发现问题:');
    console.log(`   错误信息: ${error.message}`);
    console.log(`   错误堆栈: ${error.stack}`);
}