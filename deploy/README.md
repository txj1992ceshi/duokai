# Duokai 服务端部署

## 架构边界

服务端只部署以下组件：

- `duokai-api`：控制面、任务编排、Agent 注册与状态汇聚，端口 `3100`
- `duokai-admin`：管理后台，端口 `3000`
- `fingerprint-dashboard`：业务前端，端口 `3001`

服务端**不部署浏览器 Runtime**，不安装普通 Playwright Chromium，也不监听 `3101`。浏览器环境的启动与停止统一由 API 创建控制面任务，再由已注册的 Duokai 桌面 Agent 使用 CloakBrowser 单引擎执行。Agent 离线或没有相应能力时，请求必须明确失败，不允许回退到服务器端或普通 Chromium。

## 部署入口

生产部署与合并已经解耦：push/merge 到 `main` **不会自动部署**。生产发布只能由有权操作人员手动触发 GitHub Actions 的 `Deploy Vultr` workflow，并且必须同时提供：

- `expected_sha`：触发时 `origin/main` 上的精确 40 位小写 SHA；
- `confirmation`：严格等于 `DEPLOY_VULTR`。

workflow 与远端更新脚本都会再次核对 SHA。`main` 在授权后发生移动、输入不是精确 SHA、远端拉取结果不一致时，部署必须 fail-closed。

在服务器本地执行维护流程时，必须显式提供同一授权 SHA：

```bash
EXPECTED_SHA=<exact-main-sha> ./deploy/update-from-git.sh
```

底层构建入口仍为：

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

## 合并、部署与 Profile rollout 冻结规则

1. 合并方式固定为 **merge commit**，保留完整提交审计链；不删除功能分支，直到服务器部署和回滚窗口关闭。
2. 精确候选 SHA 的全部强制机器检查通过，并由唯一项目所有者显式确认之前，不得合并；不要求第二名 reviewer。
3. 合并后仍不得自动部署；项目所有者必须对精确 `main` SHA 单独显式授权。
4. 服务器部署可以先于 Profile rollout，但部署完成后所有 Profile 必须继续保持 Pilot 空白名单、`rollout=off`，并维持全局 kill switch；不得借服务器部署顺带启用 Profile。
5. Profile rollout 必须按 Observe → 单 Profile Enforce → 小批次 → 全量迁移的独立门禁推进。

## 回滚

生产回滚必须通过 Git 历史和同一手动部署入口完成，禁止强推 `main`、禁止直接 `reset --hard` 远端分支，也禁止把生产机长期留在不属于 `origin/main` 的旧提交。

推荐流程：

1. 项目所有者显式宣布回滚，记录受影响 SHA、回滚理由和执行责任；
2. 以当前 `origin/main` 创建回滚分支；
3. 对引入问题的 merge commit 执行 `git revert -m 1 <merge-sha>`；
4. 为 revert 提交创建 PR，完成全部自动检查并由项目所有者确认精确 head SHA；
5. 合并回滚 PR 后，记录新的 `origin/main` SHA；
6. 手动触发 `Deploy Vultr`，将新的回滚 SHA 同时作为 `expected_sha`；
7. 重复 API/Admin/Frontend 健康检查，确认 PM2 中不存在 `duokai-runtime`；
8. 将故障 SHA、revert SHA、部署 run URL、健康检查与负责人写入回滚证据包。

如果 GitHub Runner 无法连接生产主机，必须先修复网络/防火墙/SSH 可达性；不能把“代码已回滚”误记为“生产已回滚”。
