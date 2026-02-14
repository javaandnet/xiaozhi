module.exports = {
  apps: [{
    name: 'xiaozhi-server',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/pm2/error.log',
    out_file: './logs/pm2/out.log',
    log_file: './logs/pm2/combined.log',
    time: true,
    min_uptime: '5s',
    max_restarts: 10
  }]
};