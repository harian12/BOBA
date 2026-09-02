module.exports = {
  apps: [
    {
      name: 'boba-sync-server',
      script: 'apps/server/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
        JWT_SECRET: process.env.JWT_SECRET || 'boba_default_secure_jwt_secret_change_me',
        DATABASE_URL: 'file:apps/server/boba_sync.sqlite',
      },
      error_file: './apps/server/logs/err.log',
      out_file: './apps/server/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      time: true,
    },
  ],
};
