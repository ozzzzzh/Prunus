#!/bin/bash

# Prunus 项目日志查看脚本
# 查看实时日志或历史日志

if [ "$1" = "--history" ]; then
    echo "📄 显示最近 100 行日志..."
    pm2 logs prunus-dev --lines 100
else
    echo "📄 实时查看日志（Ctrl+C 退出）..."
    pm2 logs prunus-dev
fi