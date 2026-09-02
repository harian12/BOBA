module.exports = {
  apps: [
    {
      name: 'boba-sync-server',
      script: 'src/index.ts',
      interpreter: 'bun',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
        JWT_SECRET: process.env.JWT_SECRET || 'boba_default_secure_jwt_secret_change_me',
        DATABASE_URL: 'file:boba_sync.sqlite',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      time: true,
    },
  ],
};
