# Duokai Server Deployment

本目录用于正式部署 `duokai` 控制面服务，不包含桌面端打包发布。

推荐原则：

- GitHub 仓库是唯一真实来源
- 服务器不再手工改业务代码
- 服务器只做 `git pull`、安装依赖、构建、重启
- 本地开发改完后提交到 GitHub，再让服务器同步

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
- `NEXT_PUBLIC_DUOKAI_API_BASE=https://your-domain.com`
- `NEXT_PUBLIC_ADMIN_BASE_PATH=/admin`
- `ADMIN_BASE_PATH=/admin`

### fingerprint-dashboard

- `PORT=3001`
- `NEXT_PUBLIC_DUOKAI_API_BASE=https://your-domain.com`
- `MONGODB_URI`
- `MONGODB_DB`
- `JWT_SECRET`
- `RUNTIME_URL=http://127.0.0.1:3101`
- `RUNTIME_API_KEY`

### runtime

- `RUNTIME_PORT=3101`
- `DASHBOARD_URL=https://your-domain.com`
- `RUNTIME_KEY`

## 服务器部署步骤

### 1. 初始化服务器代码

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

### 2. 首次部署

首次部署建议直接跑：

```bash
cd /var/www/duokai
PUBLIC_HOST=duokai.duckdns.org bash deploy/bootstrap-and-deploy.sh
```

如果你已经有 HTTPS，再改成：

```bash
cd /var/www/duokai
PUBLIC_SCHEME=https PUBLIC_HOST=duokai.duckdns.org bash deploy/bootstrap-and-deploy.sh
```

脚本会自动：

- 修正 `duokai-api / duokai-admin / fingerprint-dashboard` 的关键 `.env.local`
- 安装依赖
- 安装 Playwright Chromium
- 构建 API / admin / frontend
- 启动或重启 PM2 进程
- 执行本地健康检查

### 3. 后续更新

以后不要再在线上手改代码，统一使用：

```bash
cd /var/www/duokai
BRANCH=main PUBLIC_HOST=duokai.duckdns.org bash deploy/update-from-git.sh
```

如果已经上 HTTPS：

```bash
cd /var/www/duokai
BRANCH=main PUBLIC_SCHEME=https PUBLIC_HOST=duokai.duckdns.org bash deploy/update-from-git.sh
```

这个脚本会自动：

- `git fetch`
- `git pull --ff-only`
- 调用 `deploy/bootstrap-and-deploy.sh`

### 3.1 GitHub Actions 自动部署

仓库已经提供：

- [deploy-vultr.yml](/Users/jj/Desktop/duokai/.github/workflows/deploy-vultr.yml)

当你 push 到 `main` 时，GitHub Actions 会自动 SSH 到 Vultr 并执行：

```bash
cd /var/www/duokai
BRANCH=main PUBLIC_HOST=duokai.duckdns.org bash deploy/update-from-git.sh
```

你需要在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 中配置这些 secrets：

- `VULTR_HOST`
- `VULTR_USER`
- `VULTR_SSH_KEY`
- `VULTR_PUBLIC_HOST`

可选 secrets：

- `VULTR_PORT`
- `VULTR_ROOT_DIR`
- `VULTR_PUBLIC_SCHEME`
- `VULTR_EXTRA_CORS_ORIGINS`

按你当前服务器，最小推荐值是：

- `VULTR_HOST=66.42.50.220`
- `VULTR_USER=root`
- `VULTR_PUBLIC_HOST=duokai.duckdns.org`
- `VULTR_PUBLIC_SCHEME=http`

注意：

- `VULTR_SSH_KEY` 必须填私钥内容，不是公钥
- 服务器必须已经能通过这把私钥无交互登录
- 服务器目录必须是 Git 仓库，且远端指向你的 GitHub 仓库

### 4. 手工拆分步骤

如果你不想一键脚本，也可以手工执行。

#### 安装依赖

```bash
cd /var/www/duokai/duokai-api && npm install
cd /var/www/duokai/duokai-admin && npm install
cd /var/www/duokai/fingerprint-dashboard && npm install
cd /var/www/duokai/fingerprint-dashboard/stealth-engine && npm install
cd /var/www/duokai/fingerprint-dashboard/stealth-engine && npx playwright install chromium
```

#### 构建

```bash
cd /var/www/duokai/duokai-api && npm run build
cd /var/www/duokai/duokai-admin && npx next build --webpack
cd /var/www/duokai/fingerprint-dashboard && npx next build --webpack
```

#### 配置环境变量

建议分别创建：

- `/var/www/duokai/duokai-api/.env.local`
- `/var/www/duokai/duokai-admin/.env.local`
- `/var/www/duokai/fingerprint-dashboard/.env.local`
- `/var/www/duokai/fingerprint-dashboard/stealth-engine/.env.local`（如需单独管理）

#### 一键部署脚本

参考：

- [deploy/bootstrap-and-deploy.sh](/Users/jj/Desktop/duokai/deploy/bootstrap-and-deploy.sh)
- [deploy/update-from-git.sh](/Users/jj/Desktop/duokai/deploy/update-from-git.sh)

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

本仓库同时支持两种方案：

- 子域名拆分
- 单域名路径拆分（你当前使用的 `duokai.duckdns.org` + `/admin` + `/api`）

你当前更推荐用单域名路径拆分。

单域名示例：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com _;

    location = /api/health {
        proxy_pass http://127.0.0.1:3100/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /admin {
        proxy_pass http://127.0.0.1:3000/admin;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location = /admin/ {
        proxy_pass http://127.0.0.1:3000/admin;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

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

- `https://your-domain.com/admin/login`

### Frontend

打开：

- `https://your-domain.com/login`

## 说明

当前桌面端 `apps/duokai2` 不需要部署到服务器。它后续只需要打包发布给用户，并默认指向你的线上控制面地址。
