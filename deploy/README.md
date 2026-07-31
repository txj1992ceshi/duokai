# Duokai 服务端部署

## 架构边界

服务端只部署以下组件：

- `duokai-api`：控制面、任务编排、Agent 注册与状态汇聚，端口 `3100`
- `duokai-admin`：管理后台，端口 `3000`
- `fingerprint-dashboard`：业务前端，端口 `3001`

服务端**不部署浏览器 Runtime**，不安装普通 Playwright Chromium，也不监听 `3101`。浏览器环境的启动与停止统一由 API 创建控制面任务，再由已注册的 Duokai 桌面 Agent 使用 CloakBrowser 单引擎执行。Agent 离线或没有相应能力时，请求必须明确失败，不允许回退到服务器端或普通 Chromium。

## 部署入口

```bash
./deploy/bootstrap-and-deploy.sh
```

脚本会：

1. 写入 API、Admin 与 Frontend 必需的环境变量；
2. 安装三个服务的 Node.js 依赖；
3. 构建 API、Admin 与 Frontend；
4. 用 `deploy/ecosystem.config.cjs` 启动或重启 PM2 服务；
5. 删除历史遗留的 `duokai-runtime` PM2 进程；
6. 检查 `3100`、`3000` 与 `3001` 服务健康状态。

## PM2 服务

- `duokai-api`
- `duokai-admin`
- `duokai-frontend`

`duokai-runtime` 已退役，不得重新添加。

## 浏览器执行前置条件

- 用户设备已安装 Duokai Desktop；
- Desktop Agent 已登录并注册到控制面；
- Agent 心跳在线；
- 目标 Profile 通过 CloakBrowser 单引擎门禁；
- start/stop 请求通过 `/api/control-plane/runtime` 下发。

浏览器代理检测和任意页面动作目前没有通用控制面任务类型。相关旧直连接口返回 HTTP `410` 并保持 fail-closed，不能通过部署脚本恢复旧 Runtime。

## 验证

```bash
curl -fsS http://127.0.0.1:3100/health
curl -I -fsS http://127.0.0.1:3000
curl -I -fsS http://127.0.0.1:3001
pm2 status
```

PM2 清单中不应出现 `duokai-runtime`，主机上也不应因为部署流程下载 Playwright Chromium。
