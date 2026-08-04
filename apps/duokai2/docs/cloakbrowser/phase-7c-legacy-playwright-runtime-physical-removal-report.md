# Phase 7C 旧 Playwright Runtime 物理删除报告

- 日期：`2026-07-31`
- 工作区：`/Users/jj/Documents/duokai-cloakbrowser-phase1-poc`
- 基线 HEAD：`59fc5b61e5f072daf0e7442c24e7a7cb45ad13ed`
- Task Graph：`task_5f2312dd-c4b2-416f-99e3-d494dd8463c6`
- 前置 Phase 7B：`task_3beb06f1-e5b3-4903-85b8-36de8435125b`（completed / PASS）
- 结论：**PASS**

## 目标

在 Phase 7B 已经退役所有官方直连入口的基础上，物理删除普通 Playwright Runtime 代码、专用测试和部署元数据，并确保正式产品只保留：

```text
Dashboard / API
  → control-plane task
  → registered Duokai desktop Agent
  → CloakBrowser single engine
```

服务器端不得再安装、启动、代理或健康检查普通 Playwright Chromium；Agent 离线或任务类型不受支持时必须明确失败，不得恢复兼容旁路。

## 物理删除

删除前逐文件 SHA-256 manifest 已封存。`fingerprint-dashboard/stealth-engine` 删除规模为：

- tracked 文件：`1,835`
- 总字节数：`31,241,130`

同时删除：

- 4 个只服务旧 Runtime 的 Dashboard 测试脚本；
- 旧 Runtime 专用 Dockerfile；
- Dashboard 旧 runtime client；
- API `RUNTIME_URL` 转发库与对应测试；
- 旧 Electron local runtime launcher / manifest；
- Phase 6Q 临时 Post-Trust Probe Hook 生产文件与测试。

Redis failover 等共享基础设施工具不依赖浏览器 Runtime，继续保留。

## API 与状态语义收敛

- `/api/runtime/status` 改为读取 Agent 心跳与运行汇总；
- 普通用户只能看到自身绑定 Agent，管理员可读取全局汇总；
- 旧 runtime action、direct launch 与 browser-layer proxy check 继续返回 HTTP `410`；
- API health 不再探测 `RUNTIME_URL`；
- 服务器代理控制层检查保留，但不得启动浏览器。

## Dashboard / Admin

- Dashboard 全部启动、停止和状态语义使用 control-plane / Agent；
- Runtime URL、Runtime API Key、local/direct 模式设置已删除；
- Dashboard 删除旧目录后全量 ESLint 达到 `0 error`；
- Admin 运行状态页面改为 Agent / CloakBrowser 语义；
- 本阶段触及的 Admin 页面完成定向 ESLint、TypeScript 与生产构建。

## 不可回退门禁

`cloakBrowserSingleEnginePackaging.test.ts` 现要求：

- `fingerprint-dashboard/stealth-engine` 整目录必须不存在；
- 旧 runtime clients、API 转发库、Dockerfile、专用测试和 Electron launcher 必须不存在；
- `RUNTIME_URL`、3101、`playwright install chromium` 和旧 PM2 启动定义不得进入正式执行入口；
- 活跃 lockfile 不得重新引入普通 `playwright` 或旧 engine workspace；
- 部署脚本只允许删除历史 `duokai-runtime` PM2 进程，不得定义、启动或重启该服务。

单引擎边界测试：`5/5` passed。

## 验证结果

### Desktop

- single-engine boundary：`5/5`；
- TypeScript：通过；
- ESLint：通过；
- Cloak Runtime regression：`196/196`；
- `npm run build:dir`：通过；
- Vite renderer、Electron main、preload、macOS app directory packaging 与 ad-hoc signing：通过。

### Dashboard

- 全量 ESLint：`0 error`（warning 不阻断）；
- TypeScript `--noEmit`：通过；
- Next.js 生产构建：通过；
- 构建只使用本地合成环境变量，没有连接或修改真实数据库。

### API

- 全量 TypeScript lint：通过；
- 行为测试：`57/57`；
- 生产源码编译：通过；
- 两处既有 Mongoose index 测试类型注解已按当前库类型修正，不改变运行逻辑。

### Admin

- 本阶段变更文件定向 ESLint：`0 error`；
- TypeScript：通过；
- Next.js 生产构建：通过；
- 未把范围扩大为 Admin 全站既有 lint 重构。

### Final boundary

- `git diff --check`：通过；
- 正式执行/config 源码旧 Runtime 关键模式：`0`；
- 必须删除的旧路径：全部不存在；
- 当前仍存在的 lockfile：零差异；
- 删除前 manifest、最终边界、零残留扫描与 SHA-256 清单均封存在 Phase 7C 证据目录。

## 边界与安全

- 未访问或修改生产数据库、Profile 业务数据或代理配置；
- 未启动真实 Profile；
- 未提交、推送、合并或部署；
- 验证依赖只安装在专用 worktree 的本地 `node_modules`，没有修改活跃 lockfile；
- 历史 Phase 6Q/R3 证据保留，临时验收 Hook 不进入最终生产主线。

## 结论

Phase 7C 通过。

普通 Playwright Runtime 已从仓库的正式源码、安装、启动、部署、健康检查和管理状态路径中物理移除。CloakBrowser 与固定 `playwright-core` 契约是唯一受支持的浏览器执行引擎；不存在服务器端或本地 3101 compatibility fallback。
