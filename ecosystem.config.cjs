// PM2 配置文件
// 用于管理 Prunus 项目的后台运行和自动重启

module.exports = {
  apps: [
    {
      name: 'prunus-dev',
      script: 'npm',
      args: 'run dev',
      cwd: './',
      watch: false, // 开发模式下建议关闭 watch，避免频繁重启
      restart_delay: 1000, // 重启延迟 1 秒
      max_restarts: 10, // 最大重启次数
      autorestart: true, // 自动重启
      env: {
        NODE_ENV: 'development',
      },
      // 日志配置
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 进程管理
      kill_timeout: 5000, // 优雅关闭超时时间
      wait_ready: false,
      listen_timeout: 3000,
    },
  ],
};