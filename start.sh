#!/bin/bash

# 小智服务器快速启动脚本

echo "🤖 小智物联网后台服务器启动脚本"
echo "=================================="

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 未找到Node.js，请先安装Node.js"
    exit 1
fi

# 检查npm是否安装
if ! command -v npm &> /dev/null; then
    echo "❌ 未找到npm，请先安装npm"
    exit 1
fi

echo "✅ Node.js版本: $(node --version)"
echo "✅ npm版本: $(npm --version)"

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装项目依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
    echo "✅ 依赖安装完成"
else
    echo "✅ 依赖已安装"
fi

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "📋 创建环境变量文件..."
    cp .env.example .env
    echo "✅ 环境变量文件已创建，请根据需要修改 .env 文件"
fi

# 启动服务器
echo "🚀 启动小智服务器..."
echo "🌐 访问地址: http://localhost:3000"
echo "🔌 WebSocket地址: ws://localhost:3000"
echo "⌨️  按 Ctrl+C 停止服务器"
echo "=================================="

npm start