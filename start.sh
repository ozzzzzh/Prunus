#!/bin/bash

# Prunus 项目启动脚本
# 使用 PM2 后台运行项目

echo "🚀 启动 Prunus 开发服务器..."

# 检查 PM2 是否已安装
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 未安装，正在安装..."
    npm install -g pm2
fi

# 启动项目
pm2 start ecosystem.config.cjs

# 显示状态
pm2 status

echo ""
echo "✅ Prunus 已在后台启动！"
echo ""
echo "📝 常用命令："
echo "  查看日志: pm2 logs prunus-dev"
echo "  查看状态: pm2 status"
echo "  重启服务: pm2 restart prunus-dev"
echo "  停止服务: pm2 stop prunus-dev"
echo "  删除服务: pm2 delete prunus-dev"
echo "  监控面板: pm2 monit"
echo ""
