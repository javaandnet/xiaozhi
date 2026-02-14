#!/bin/bash

# 小智服务器PM2管理脚本

case "$1" in
    start)
        echo "🚀 启动小智服务器..."
        pm2 start ecosystem.config.js
        ;;
    stop)
        echo "🛑 停止小智服务器..."
        pm2 stop xiaozhi-server
        ;;
    restart)
        echo "🔄 重启小智服务器..."
        pm2 restart xiaozhi-server
        ;;
    status)
        echo "📊 服务器状态:"
        pm2 list
        ;;
    logs)
        echo "📋 查看日志:"
        pm2 logs xiaozhi-server
        ;;
    monit)
        echo "🖥️  实时监控:"
        pm2 monit
        ;;
    delete)
        echo "🗑️  删除服务器进程:"
        pm2 delete xiaozhi-server
        ;;
    *)
        echo "使用方法: ./pm2-manager.sh {start|stop|restart|status|logs|monit|delete}"
        echo ""
        echo "命令说明:"
        echo "  start   - 启动服务器"
        echo "  stop    - 停止服务器"
        echo "  restart - 重启服务器"
        echo "  status  - 查看服务器状态"
        echo "  logs    - 查看服务器日志"
        echo "  monit   - 实时监控服务器"
        echo "  delete  - 删除服务器进程"
        exit 1
        ;;
esac