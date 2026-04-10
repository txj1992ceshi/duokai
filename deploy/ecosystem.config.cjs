module.exports = {
  apps: [
    {
      name: 'duokai-api',
      cwd: '/var/www/duokai/duokai-api',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: '3100',
      },
    },
    {
      name: 'duokai-runtime',
      cwd: '/var/www/duokai/fingerprint-dashboard/stealth-engine',
      script: 'node',
      args: 'server.js',
      env: {
        NODE_ENV: 'production',
        RUNTIME_PORT: '3101',
        DASHBOARD_URL: process.env.DASHBOARD_URL || 'http://127.0.0.1:3001',
      },
    },
    {
      name: 'duokai-admin',
      cwd: '/var/www/duokai',
      script: 'deploy/start-next-app.sh',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        APP_DIR: '/var/www/duokai/duokai-admin',
        APP_PORT: '3000',
        APP_HOST: '0.0.0.0',
        APP_LABEL: 'duokai-admin',
      },
    },
    {
      name: 'duokai-frontend',
      cwd: '/var/www/duokai',
      script: 'deploy/start-next-app.sh',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        APP_DIR: '/var/www/duokai/fingerprint-dashboard',
        APP_PORT: '3001',
        APP_HOST: '0.0.0.0',
        APP_LABEL: 'duokai-frontend',
      },
    },
  ],
};
