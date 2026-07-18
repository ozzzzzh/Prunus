# Prunus 后台运行快速指南

## 🚀 快速开始

### 启动服务
```bash
./start.sh
```

服务将在后台运行，访问地址：
- 本地：http://localhost:5173/
- 网络：http://10.1.0.12:5173/

### 查看状态
```bash
pm2 status
```

### 查看日志
```bash
# 实时查看日志
./logs.sh

# 查看历史日志
./logs.sh --history
```

### 重启服务
```bash
./restart.sh
```

### 停止服务
```bash
./stop.sh
```

## 📋 当前状态

✅ **服务已启动**：`prunus-dev`
- **进程 ID**：1043567
- **状态**：online
- **运行时间**：正在运行
- **内存占用**：55.5 MB
- **访问地址**：http://localhost:5173/

## 🔧 常用命令速查

| 操作 | 命令 |
|------|------|
| 启动 | `./start.sh` |
| 停止 | `./stop.sh` |
| 重启 | `./restart.sh` |
| 查看日志 | `./logs.sh` |
| 查看状态 | `pm2 status` |
| 监控面板 | `pm2 monit` |
| 删除服务 | `pm2 delete prunus-dev` |

## 🎯 自动重启机制

PM2 会在以下情况自动重启服务：
- ✅ 进程崩溃
- ✅ 内存超限
- ✅ 手动重启

## 📝 日志文件位置

- 输出日志：`./logs/pm2-out.log`
- 错误日志：`./logs/pm2-error.log`

## 🔄 开机自启动（可选）

如果需要开机自启动：

```bash
# 生成启动脚本
pm2 startup

# 保存当前进程列表
pm2 save
```

## ⚠️ 注意事项

1. **不要同时运行多个实例**：同一端口只能运行一个服务
2. **修改代码后需重启**：开发模式下不会自动重载（可手动重启）
3. **查看错误日志**：如果服务无法启动，先查看错误日志

## 🆘 故障排查

### 端口被占用
```bash
# 查看端口占用
lsof -i:5173

# 杀死占用进程
kill -9 <PID>
```

### 服务无法启动
```bash
# 查看错误日志
pm2 logs prunus-dev --err

# 尝试手动启动
npm run dev
```

### 清理并重新启动
```bash
# 完全删除服务
pm2 delete prunus-dev

# 重新启动
./start.sh
```

---

更多信息请查看：[docs/pm2-management.md](./docs/pm2-management.md)
