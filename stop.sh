#!/bin/bash

# Prunus 项目停止脚本
# 停止 PM2 运行的服务

echo "🛑 停止 Prunus 开发服务器..."

pm2 stop prunus-dev

echo "✅ Prunus 已停止"
pm2 status