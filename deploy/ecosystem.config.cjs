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
        DASHBOARD_URL: 'https://app.your-domain.com',
      },
    },
    {
      name: 'duokai-admin',
      cwd: '/var/www/duokai/duokai-admin',
      script: 'node_modules/next/dist/bin/next',
      interpreter: 'node',
      args: 'start --hostname 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
    {
      name: 'duokai-frontend',
      cwd: '/var/www/duokai/fingerprint-dashboard',
      script: 'node_modules/next/dist/bin/next',
      interpreter: 'node',
      args: 'start --hostname 0.0.0.0 --port 3001',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
    },
  ],
};
