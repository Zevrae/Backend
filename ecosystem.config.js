// PM2 process configuration. Run with: pm2 start ecosystem.config.js
export default {
  apps: [
    {
      name: 'zevrae-backend',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
      autorestart: true,
      watch: false,
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
