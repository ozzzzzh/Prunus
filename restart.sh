#!/bin/bash

# Prunus 项目重启脚本
# 重启 PM2 运行的服务

echo "🔄 重启 Prunus 开发服务器..."

pm2 restart prunus-dev

echo "✅ Prunus 已重启"
pm2 status