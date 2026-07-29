# Phase 6E：真实单 Profile Observe 样本扩充报告

- 执行日期：2026-07-28
- 隔离工作区：`~/Documents/duokai-cloakbrowser-phase1-poc`
- 分支：`codex/cloakbrowser-phase1-poc`
- Task Graph：`task_8bdd7556-3757-41f7-a645-643d50564f22`
- 目标 Profile：`试点 Profile`（`<pilot-profile-id>`）
- 旁路 Profile：`非目标 Profile`（`<non-target-profile-id>`），全程不得启动
- CloakBrowser 版本：`145.0.7632.109.2`
- CloakBrowser 二进制 SHA256：`79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79`
- 测试 App `app.asar` SHA256：`5d7acb7e4e29cc3dca7c4bdaa582997ddcf93b87bf595a211bfbd07a28de6402`
- 最终决策：**BLOCKED / NO-GO**

## 1. 阶段目标

Phase 6E 原计划在 Phase 6D 已通过的一条真实 Observe 样本基础上，再补齐四条独立成功样本。每条样本必须满足：

1. 使用新的 rollout ID 和空 health 窗口；
2. Pilot 精确只启用 `试点 Profile`；
3. 最大并发为 1，`非目标 Profile` 始终保持 `stopped`；
4. 通过产品 `runtime.launch` 进入真实 CloakBrowser 链路；
5. 达到 `trusted/running` 后持续存活至少 60 秒；
6. 观察期间无 EPIPE、全局 shutdown、主窗口意外关闭或其他致命审计事件；
7. 使用产品 `runtime.stop` 停止；
8. 同一 App 会话内 Profile 状态立即收敛为 `stopped`；
9. 无运行锁、未完成 production transaction、CloakBrowser 或测试 App 残留；
10. 每轮结束恢复 Pilot 空名单、rollout `off`、批次 disabled、批次 kill switch 开启。

约束规定任何真实样本失败后立即停止，不重跑失败样本，不进入 Enforce。

## 2. 执行器与审计边界

为避免四轮人工操作漂移，本阶段新增了隔离证据执行器：

```text
.pilot-runtime/phase6e-observe-20260728T115000Z/run-observe-sample.mjs
```

执行器只在本阶段证据目录内写入脚本和结果文件，并通过项目现有的原子控制文件写入函数及桌面 preload 产品 API 完成：

- Observe 控制配置；
- App 启动与 CDP 产品桥接；
- `runtime.launch`；
- trusted 后持续状态采样；
- `runtime.stop`；
- Pilot 禁用；
- fail-closed 控制恢复；
- App 退出与证据保存。

执行器没有修改产品源码、没有修改 `~/Documents/duokai`、没有 commit、merge、push 或发布。

首次尝试通过 Codex Runtime 沙箱运行样本 2 时，写正式控制目录的 `chmod` 被沙箱以 `EPERM` 拒绝。错误发生在正式控制写入和 App 启动之前，因此不计为真实 Observe 样本。随后按工具建议改用已授权的本机 owner execution 通道执行同一脚本，没有降低任何产品门禁。

## 3. 样本结果

| 样本 | Rollout ID | Trusted 时间 | 持续观察 | 最终状态 | 结果 |
|---|---|---:|---:|---|---|
| 1（Phase 6D） | `phase6d-lifecycle-observe-r2-20260728T110320Z` | `2026-07-28T11:10:06.728Z` | 超过 60 秒 | `stopped` | 有效成功 |
| 2 | `phase6e-observe-s2-20260728T115944451Z` | `2026-07-28T12:00:17.926Z` | `66,961 ms` | `stopped` | 有效成功 |
| 3 | `phase6e-observe-s3-20260728T120231473Z` | `2026-07-28T12:03:01.602Z` | `67,047 ms` | `stopped` | 有效成功 |
| 4 | `phase6e-observe-s4-20260728T120442280Z` | `2026-07-28T12:05:17.273Z` | `68,960 ms` | `stopped` | 有效成功 |
| 5 | `phase6e-observe-s5-20260728T120704839Z` | `2026-07-28T12:07:37.003Z` | 约 `60,716 ms` 后 context 关闭 | `stopped` | **失败** |

本阶段新增有效成功样本为 **3 条**，目标为 4 条。连同 Phase 6D，累计有效持续成功样本为 **4 条**。

## 4. 样本 2–4 通过项

样本 2、3、4 均满足以下条件：

- 只启动 `试点 Profile`；
- `非目标 Profile` 始终保持 `stopped`；
- 使用独立 rollout ID 和独立 health 文件；
- 进入真实 CloakBrowser 145；
- trusted 后持续运行超过 60 秒；
- 没有 EPIPE、非预期 `process_shutdown_begin`、主窗口自动关闭或未处理异常；
- 使用产品 `runtime.stop` 后立即收敛为 `stopped`；
- `runningProfileIds`、`queuedProfileIds`、`startingProfileIds` 均清空；
- `.duokai-runtime-lock.json` 和 production transaction journal 均不存在；
- 测试 App 与 CloakBrowser 均退出；
- Pilot、rollout 和批次控制均恢复 fail-closed；
- App 与 CloakBrowser 二进制哈希在三轮间保持一致。

## 5. 样本 5 阻断故障

### 5.1 时间线

- `12:07:37.003Z`：正式 rollout health 写入 `success=true, reason=trusted`；
- `12:07:37.014Z`：记录 CDP 存活门禁通过，`5,572 ms / 5` 次采样；
- `12:07:37.015Z`：数据库日志记录 Cloak Pilot 启动成功；
- `12:08:37.716Z`：安全 stop 阶段保存 storage state 时收到：
  `browserContext.storageState: Protocol error (Target.createTarget): Failed to open a new tab`；
- `12:08:37.731Z`：数据库日志记录 `Closed Cloak Pilot profile "试点 Profile"`；
- `12:08:38.015Z`：执行器记录持续观察失败并完成 fail-closed 收尾。

从正式 trusted outcome 到 context 关闭约为 **60.728 秒**。

### 5.2 已排除项

在 context 关闭之前，没有发现：

- EPIPE；
- `unhandledRejection`；
- `uncaughtException`；
- 非预期 `process_shutdown_begin`；
- `main_window_close`；
- App 主进程提前退出；
- 第二个 Profile 启动；
- 并发数超限；
- 二进制、版本或网络身份漂移。

`process_shutdown_begin` 只出现在执行器检测失败、完成 stop 和 fail-closed 后主动关闭测试 App 的阶段。

### 5.3 尚未确定的根因

现有审计只记录了 context 已关闭，没有记录 CloakBrowser 进程退出码、signal、最后一个页面关闭原因或底层 CDP transport disconnect 原因。因此目前只能确认：

> CloakBrowser context 在 trusted 后约 60.7 秒自行失活，触发状态从 `running/trusted` 收敛为 `stopped`。

不能在没有额外证据的情况下将其归因于 startup verification 的 60 秒 timeout。源码中该 timeout 仅包裹 `verifyStartup`，并在 Promise 完成后清理 timer；现有证据不支持 timer 泄漏结论。

## 6. 新发现：正式 health 存在假成功窗口

样本 5 暴露了比单次 context 关闭更严重的控制面问题：

1. `recordSuccess('trusted')` 在 context 注册后立即执行；
2. 此时只完成约 5 秒启动存活门禁；
3. 样本 5 随后在 60 秒持续观察中失败；
4. rollout health 仍只保留一条 `success=true, reason=trusted`；
5. context 关闭没有撤销该成功，也没有追加 `post_trust_liveness_failed` 失败 outcome。

因此当前 health 文件可能把“启动成功但会话不稳定”的样本错误计为成功。若直接依赖该文件计算发布资格，存在假绿灯风险。

这是 Enforce 的独立阻断项。后续必须确保成功样本只在持续存活门禁完成后发布，或者在 trusted 后失活时追加可被熔断器识别的失败 outcome。

## 7. 聚合判定

按真实持续运行结果聚合：

- 真实 Observe 尝试：5；
- 有效持续成功：4；
- 持续失败：1；
- 持续失败率：20%；
- Phase 6E 计划新增成功：4；
- Phase 6E 实际新增成功：3。

虽然 20% 低于配置中的 `maxFailureRate=25%`，但不能据此放行：

1. 用户批准的本阶段目标是累计 5 条有效成功样本，而不是仅 5 次尝试；
2. 当前只有 4 条有效持续成功样本；
3. 样本 5 证明正式 health 语义会过早发布成功；
4. 每个独立 rollout 的原生 health 窗口都只有 1 条 outcome，单个 rollout 从未满足 `minimumSamples=5`；
5. context 约 60.7 秒关闭的底层原因尚未定位。

最终判定：**BLOCKED / NO-GO，不得进入 Enforce。**

## 8. 最终安全状态

Phase 6E 停止后已确认：

- `试点 Profile`：`stopped`；
- `非目标 Profile`：`stopped`；
- Pilot：空名单；
- rollout：`off`；
- 当前批次：`enabled=false`；
- 当前批次 kill switch：`true`；
- 运行锁：不存在；
- production transaction：不存在；
- 测试 App：未运行；
- CloakBrowser：未运行；
- `/Applications/Duokai.app`：未运行；
- 正式数据库静态副本与源文件 SHA256 一致：
  `b3d83bb7e6e9a6f2924fc1435c55597e4078673f201dbdc6677dab6aa6fed6ac`；
- 静态副本 `quick_check=ok`；
- 静态副本 `integrity_check=ok`。

数据库审计副本：

```text
.pilot-runtime/phase6e-observe-20260728T115000Z/final-db-snapshot.sqlite
```

聚合结果：

```text
.pilot-runtime/phase6e-observe-20260728T115000Z/aggregate-result.json
```

## 9. 下一阶段要求

下一阶段不应继续盲目补样本，也不能创建 Enforce canary。必须先进入生命周期与 health 语义修复阶段，至少完成：

1. 为 Cloak context/browser/CDP transport 增加关闭原因、进程退出码和 signal 审计；
2. 将正式 rollout success 发布延后到 post-trust 持续存活门禁通过之后；
3. trusted 后 context 关闭时追加明确失败 outcome，并触发熔断/回滚门禁；
4. 增加“trusted 后第 60 秒关闭”的自动回归测试；
5. 修复后重新从全新的单 Profile Observe 窗口开始；
6. 在同一发布批次或经正式授权的聚合模型中取得满足门禁的有效样本；
7. 再次进行独立 Enforce 资格评审。

在以上修复和复验完成前，Enforce 必须保持禁用。
