# Duokai Server Deployment

本目录用于正式部署 `duokai` 控制面服务，不包含桌面端打包发布。

## 服务器上必须保留 / 上传的目录

以下目录是部署控制面所需的最小集合：

- `duokai-api`
- `duokai-admin`
- `fingerprint-dashboard`
- `deploy`

其中：

- `fingerprint-dashboard/stealth-engine` 是运行时服务的一部分，必须保留
- `duokai-admin` 是后台管理站
- `fingerprint-dashboard` 是前台 Web 工作台
- `duokai-api` 是统一 API 服务

## 服务器上不需要部署的目录

这些目录不属于当前控制面上线必需内容：

- `apps/duokai2`
- `启动入口`
- `legacy-launchers`
- `ci`
- `tools`

以下目录属于可选辅助资源，不是服务启动必需：

- `monitoring`
- `duokai-api/docs`
- `.github`

## 端口规划

建议统一使用以下端口：

- `duokai-api`: `3100`
- `runtime` (`fingerprint-dashboard/stealth-engine`): `3101`
- `duokai-admin`: `3000`
- `fingerprint-dashboard`: `3001`

Nginx 对外统一暴露 80/443，再反向代理到以上本地端口。

## 环境变量

### duokai-api

需要至少配置：

- `PORT=3100`
- `MONGODB_URI`
- `MONGODB_DB`
- `JWT_SECRET`
- `AGENT_JWT_SECRET`
- `RUNTIME_URL=http://127.0.0.1:3101`
- `RUNTIME_API_KEY`
- `CORS_ORIGINS`

TTL 推荐：

- `ADMIN_ACTION_LOG_TTL_DAYS=30`
- `TASK_EVENT_TTL_DAYS=30`
- `AGENT_SESSION_TTL_DAYS=30`
- `CONTROL_TASK_TTL_DAYS=0`

### duokai-admin

- `PORT=3000`
- `NEXT_PUBLIC_DUOKAI_API_BASE=https://api.your-domain.com`

### fingerprint-dashboard

- `PORT=3001`
- `NEXT_PUBLIC_DUOKAI_API_BASE=https://api.your-domain.com`
- `MONGODB_URI`
- `MONGODB_DB`
- `JWT_SECRET`
- `RUNTIME_URL=http://127.0.0.1:3101`
- `RUNTIME_API_KEY`

### runtime

- `RUNTIME_PORT=3101`
- `DASHBOARD_URL=https://app.your-domain.com`
- `RUNTIME_KEY`

## 服务器部署步骤

### 1. 上传代码

建议服务器目录：

```bash
/var/www/duokai
```

你可以直接：

```bash
git clone https://github.com/txj1992ceshi/duokai.git /var/www/duokai
cd /var/www/duokai
git checkout main
```

### 2. 安装依赖

```bash
cd /var/www/duokai/duokai-api && npm install
cd /var/www/duokai/duokai-admin && npm install
cd /var/www/duokai/fingerprint-dashboard && npm install
cd /var/www/duokai/fingerprint-dashboard/stealth-engine && npm install
cd /var/www/duokai/fingerprint-dashboard/stealth-engine && npx playwright install chromium
```

### 3. 构建

```bash
cd /var/www/duokai/duokai-api && npm run build
cd /var/www/duokai/duokai-admin && npm run build
cd /var/www/duokai/fingerprint-dashboard && npm run build
```

### 4. 配置环境变量

建议分别创建：

- `/var/www/duokai/duokai-api/.env.local`
- `/var/www/duokai/duokai-admin/.env.local`
- `/var/www/duokai/fingerprint-dashboard/.env.local`
- `/var/www/duokai/fingerprint-dashboard/stealth-engine/.env.local`（如需单独管理）

### 5. 使用 PM2 启动

参考：

- [deploy/ecosystem.config.cjs](/Users/jj/Desktop/duokai/deploy/ecosystem.config.cjs)

```bash
cd /var/www/duokai
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

### 6. 配置 Nginx

参考：

- [deploy/nginx/duokai.conf.example](/Users/jj/Desktop/duokai/deploy/nginx/duokai.conf.example)

建议域名拆分：

- `api.your-domain.com` -> `duokai-api`
- `admin.your-domain.com` -> `duokai-admin`
- `app.your-domain.com` -> `fingerprint-dashboard`

## 上线前最小检查

### API

```bash
curl http://127.0.0.1:3100/health
```

### Runtime

```bash
curl http://127.0.0.1:3101/health
```

### Admin

打开：

- `https://admin.your-domain.com`

### Frontend

打开：

- `https://app.your-domain.com`

## 说明

当前桌面端 `apps/duokai2` 不需要部署到服务器。它后续只需要打包发布给用户，并默认指向你的线上 API。
