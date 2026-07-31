# Phase 7B 旧直连 Runtime 入口退役报告

- 日期：`2026-07-31`
- 工作区：`/Users/jj/Documents/duokai-cloakbrowser-phase1-poc`
- 基线 HEAD：`59fc5b61e5f072daf0e7442c24e7a7cb45ad13ed`
- Task Graph：`task_3beb06f1-e5b3-4903-85b8-36de8435125b`
- 前置审计图：`task_7583d94f-05c9-40ac-ac1f-04a838911c2f`（因 worktree Git 元数据写权限不足 blocked；审计结论有效，未产生文件变更）
- Phase 6Q R3：`task_f3b92acc-1ab1-4be9-8da3-ecc5d7c0fd55`（completed / PASS）
- 结论：**PASS**

## 目标

在不直接删除 `fingerprint-dashboard/stealth-engine` 目录的前提下，先退役所有可以选择、调用、拉起、安装或部署普通 Playwright Runtime 的官方入口，确保正式产品路径只能使用：

```text
Dashboard / API
  → control-plane start|stop task
  → registered Duokai desktop Agent
  → CloakBrowser single engine
```

当 Agent 离线或控制面没有对应任务类型时，系统必须明确失败，不允许回退到服务器端 Runtime、普通 Chromium 或 system-default 浏览器。

## 已完成变更

### Desktop

- 删除 `localRuntimeLauncher.ts` 与 `localRuntimeManifest.ts`；
- 移除 Electron `runtime.ensureLocalRuntime` / `runtime.getLocalRuntimeInfo` IPC、preload 与共享类型；
- 撤除仅用于 Phase 6Q 验收的 Post-Trust Probe Hook 生产差异；
- 保留 Phase 6Q R3 的密封证据，不把临时诊断能力带入最终主线。

### Dashboard

- 启动、停止和运行状态统一使用 control-plane / Agent 状态；
- 删除 `runtimeClient.ts` 与 `localRuntimeClient.ts`；
- `/api/runtime/[action]` 返回 HTTP `410` 与 `LEGACY_DIRECT_RUNTIME_RETIRED`；
- `/api/proxy/browser-check` 返回 HTTP `410` 与 `LEGACY_BROWSER_PROXY_CHECK_RETIRED`；
- 未支持的浏览器代理检测和任意行为执行保持 fail-closed；
- 移除 Runtime URL、Runtime API Key 与 local/control-plane 模式切换设置。

### 启动与安装

- Mac/Linux 和 Windows 的 Web/Admin 启动脚本只启动 API 与前端；
- 安装脚本不再安装 `fingerprint-dashboard/stealth-engine` 依赖；
- 不再运行 `playwright install chromium`；
- 用户可见文档明确浏览器路径为 control-plane → desktop Agent → CloakBrowser。

### Deployment / CI

- PM2 清单只包含 API、Admin 与 Frontend；
- `duokai-runtime` 从 PM2 定义中删除；
- 部署脚本不再设置 `RUNTIME_URL`、运行 3101 健康检查或安装 Playwright Chromium；
- 部署过程会清理历史遗留的 `duokai-runtime` PM2 进程；
- CI 统一调用 canonical 部署入口。

## 不可回退门禁

`cloakBrowserSingleEnginePackaging.test.ts` 新增正式入口静态断言：

- 六个旧客户端、launcher、manifest 与 Phase 6Q Hook 文件必须不存在；
- Electron main/preload/shared IPC 不得出现旧 Runtime 自启能力；
- Dashboard 不得引用 direct runtime clients 或 execution-mode switch；
- 旧 route 必须保持 HTTP `410`；
- 正式启动、安装、部署与 CI 文件不得包含旧引擎路径、Chromium 下载命令、3101 Runtime 配置或 PM2 `duokai-runtime` 定义。

## 验证结果

### Static / scripts

- `git diff --check`：通过；
- 6 个 shell 入口 `bash -n`：通过；
- shell 可执行位：全部保持 `0755`；
- package-lock 变更：`0`；
- 官方可执行入口旧 Runtime 关键模式：`0`（不可回退测试自身的正则文本除外）。

### Desktop

- single-engine boundary：`4/4`；
- TypeScript project build：通过；
- ESLint：通过；
- Cloak runtime regression：`195/195`；
- `npm run build:dir`：通过；
- Vite renderer、Electron main、preload、macOS app directory packaging 与 ad-hoc signing：通过。

### Dashboard

- 变更文件定向 ESLint：通过；
- TypeScript `--noEmit`：通过；
- Next.js 16 生产构建：通过；
- 构建使用本地合成 `MONGODB_URI` / `JWT_SECRET`，没有连接或修改真实数据库；
- 完整仓库 lint 仍会扫描隔离待删的 `stealth-engine` CommonJS 源码及少量既有非本轮错误，因此不作为 Phase 7B 入口退役判定依据；这项残留作为 Phase 7C 物理删除输入。

### API

- API 行为测试：`62/62`；
- 排除 `*.test.ts` 后的全部生产 TypeScript 编译与产物生成：通过；
- 完整 lint 仅被既有 `profileWorkspace.test.ts` 两处 Mongoose index 类型注解阻断，本轮未修改 API 源码或该测试。

## 边界与安全

- 未触碰原始仓库；
- 未访问或修改生产数据库、Profile 业务数据或代理配置；
- 未提交、推送、合并或部署；
- 本地验证依赖使用 `--package-lock=false --workspaces=false` 安装，lockfile 零差异；
- `stealth-engine` 目录仍存在，但已无官方执行、安装或部署调用方。

## 下一阶段：Phase 7C

创建独立 Task Graph，执行物理删除：

1. 删除 `fingerprint-dashboard/stealth-engine` 全目录；
2. 删除只服务于旧 Runtime 的测试与工具；
3. 清理 `.gitignore`、历史 launcher 文档和 package metadata 中的目录残留；
4. 重新运行 Dashboard 全量 lint、TypeScript、构建与全仓旧引擎扫描；
5. 不得恢复任何 compatibility route、3101 服务或普通 Playwright Chromium 依赖。
