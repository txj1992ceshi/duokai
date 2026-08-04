# Phase 6I — 硬化包真实单 Profile Observe 复验报告

## 结论

- **Phase 6I：BLOCKED（未形成 Observe 样本）**
- **Enforce：NO-GO**
- 本次不计成功或失败健康样本，因为产品 `runtime.launch` API 从未调用，目标 Profile 从未启动。
- 未进行重开、重跑或第二次 rollout。

## 授权范围

本阶段获授权使用 Phase 6H 硬化目录包，对单一 Profile `试点 Profile` 执行一次独立 Observe rollout。约束为单 Profile、单 rollout、任何异常立即停止、产品 API 启停、结束后恢复 fail-closed，不进入 Enforce。

## 身份与门禁

- App：`~/Documents/duokai-cloakbrowser-phase1-poc/apps/duokai2/release/mac-arm64/Duokai.app`
- App ASAR SHA256：`e7625dcfd8172b428ef24b0db4d366f0421feb17a935486a450e9ec55b924898`
- CloakBrowser 二进制：`~/.cloakbrowser/chromium-145.0.7632.109.2/Chromium.app/Contents/MacOS/Chromium`
- CloakBrowser SHA256：`79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79`
- Rollout：`phase6i-hardened-observe-20260728T150634Z`
- Batch：`single-linkedin1-phase6i`
- Profile：`试点 Profile` (`<pilot-profile-id>`)
- CDP 端口：`54265`
- 外部 sustained 观察门槛：`90,000 ms`

预检通过：硬化包与 CloakBrowser 哈希匹配；两个 Profile 均为 `stopped`；controls 为 fail-closed；运行锁及生产事务文件均不存在；数据库静态快照 `quick_check` 与 `integrity_check` 均为 `ok`。

## 阻断经过

1. Phase 6I 专用执行器完成只读 `check`，随后原子写入唯一 Observe controls，health outcomes 初始化为空。
2. 通过结构化 `remote_ops_run.localAppOpen` 请求打开硬化 `Duokai.app`，并请求 CDP 参数 `--remote-debugging-port=54265` 与 `--remote-debugging-address=127.0.0.1`。
3. macOS 实际创建主进程 PID `23010`，但 `54265` 始终没有监听。
4. `.app` 路径状态检查一度误报 `running=false`；后续精确 PID 检查确认 PID `23010` 仍在后台运行。
5. 因产品 API 客户端无法连接 CDP，Observe 执行器没有进入 `observe` 模式：没有 `observe-start.json`、`trusted-status.json`、`result.json`，也没有 Profile 启动。
6. 立即执行专用 `restore`，恢复 `enabledProfileIds=[]`、`mode=off`、batch disabled、batch kill switch=true。
7. 使用结构化 `localAppQuit` 且精确 bundle ID `com.jj.duokai2` 退出后台进程；最终 PID 不存在，端口无监听。

### 根因边界

当前证据能确定的是：**结构化应用打开成功创建了硬化 App 进程，但没有建立所需 CDP 端点**。`remote_ops_run` 的操作回执未证明请求参数实际到达 Electron 主进程，因此根因可能位于启动工具的参数传播，也可能位于 App 对启动参数的处理。现有证据不足以在两者之间下定论，不能归因于 CloakBrowser Profile 生命周期。

## 最终安全状态

- `pilot.enabledProfileIds = []`
- `rollout.mode = off`
- Phase 6I batch：`enabled=false`、`killSwitch=true`
- Phase 6I health outcomes：`0`
- `试点 Profile`：`stopped`
- `非目标 Profile`：`stopped`
- 四个运行锁/生产事务路径：全部不存在
- 硬化 Duokai 主进程 PID `23010`：不存在
- CDP `54265`：无监听
- Cloak Chromium App：未运行
- `/Applications/Duokai.app`：未运行
- 未 commit、merge、push 或发布；正式仓库未修改。

## 证据

- 结构化失败：`.pilot-runtime/phase6i-observe-20260728T150634Z/launch-harness-failure.json`
- Controls manifest：`.pilot-runtime/phase6i-observe-20260728T150634Z/control-manifest.json`
- 手动 fail-closed 回执：`.pilot-runtime/phase6i-observe-20260728T150634Z/manual-failclosed-control.json`
- 最终 controls：`.pilot-runtime/phase6i-observe-20260728T150634Z/final-controls/`
- 最终数据库快照：`.pilot-runtime/phase6i-observe-20260728T150634Z/final-db-snapshot.sqlite`
- 数据库检查：`.pilot-runtime/phase6i-observe-20260728T150634Z/final-db-check.txt`
- App 系统日志：`.pilot-runtime/phase6i-observe-20260728T150634Z/app-launch-system-log.txt`
- Prepare 后审计：`.pilot-runtime/phase6i-observe-20260728T150634Z/audit-after-prepare.json`

## 下一门禁

先离线修复或替换真实复验的 App 启动通道，使其能够：

1. 可审计地向 Electron 传递 CDP 参数；
2. 以精确 PID 或 bundle ID 验证主进程；
3. 在 CDP 未就绪时自动退出 App 并恢复 fail-closed；
4. 对参数传播与端口就绪增加离线/集成测试。

完成该启动通道修复后，新的真实 Observe 仍需再次明确授权。本次不得视为 Phase 6H 硬化包的产品失败样本，也不得据此进入 Enforce。
