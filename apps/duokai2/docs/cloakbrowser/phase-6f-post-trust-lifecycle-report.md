# Phase 6F：Post-Trust 生命周期可观测性与延迟成功语义修复报告

- 执行日期：2026-07-28
- 隔离工作区：`~/Documents/duokai-cloakbrowser-phase1-poc`
- 分支：`codex/cloakbrowser-phase1-poc`
- Task Graph：`task_2301133f-2e9e-4552-ad6a-e084ede824ce`
- 执行模式：仅离线源码、测试、类型检查、构建与 ASAR 审计
- 真实 Profile / 浏览器启动：未执行
- 正式控制文件 / 正式数据库写入：未执行
- 最终阶段判定：**离线修复 GO；真实 Observe 仍需重新验证；Enforce NO-GO**

## 1. 背景与阻断问题

Phase 6E 的第 5 条真实 Observe 样本在进入 `trusted` 后约 60.7 秒发生 CloakBrowser context 关闭。该样本实际没有满足持续运行要求，但正式 rollout health 已在启动阶段写入：

```text
success=true
reason=trusted
```

context 后续关闭时没有撤销成功，也没有追加失败 outcome，形成了“启动通过即假绿灯”的发布风险。

Phase 6F 处理两个明确阻断：

1. 为 CloakBrowser Browser、page 与 context 生命周期增加可审计关闭原因分类；
2. 将 rollout 成功发布延后到产品内 post-trust 持续存活门禁完成之后，并在门禁前失活时写入失败 outcome。

## 2. 新增 Post-Trust Rollout Gate

新增文件：

```text
apps/duokai2/electron/services/cloakBrowserPostTrustGate.ts
```

核心对象 `CloakPostTrustRolloutGate` 接管启动阶段取得的 `CloakRolloutAdmissionLease`。lease 在持续存活验证结束之前保持待决，不再在刚进入 `trusted` 时立即写成功。

默认门禁策略：

- 最短持续时间：`60,000 ms`
- 采样间隔：`5,000 ms`
- 最少采样数：`13`
- 探针：复用现有 `verifyCloakContextLiveness`
- Browser 级验证：通过 CDP `Browser.getVersion`

只有门禁完整通过后，才写入：

```text
success=true
reason=post_trust_liveness_passed
```

以下情况在门禁完成前一律写失败：

- Browser disconnected；
- context 提前关闭；
- 最后页面关闭并导致会话失活；
- CDP Browser 探针失败；
- 用户在门禁完成前 stop；
- 应用在门禁完成前 graceful shutdown；
- launch 后续收尾失败；
- rollout health 成功 outcome 无法持久化。

一条 admission lease 最多产生一个 outcome。Browser disconnected、context close 和 liveness 探针可能并发到达，但状态机只接受第一个终态，后到信号不能覆盖或追加矛盾结果。

## 3. 成功写入失败时的 Fail-Closed 语义

若 60 秒持续存活门禁已经通过，但 `recordSuccess(...)` 写 rollout health 时抛出 I/O 或权限错误，状态机不会返回“通过但未记录”。它会改为：

```text
success=false
reason=post_trust_outcome_write_failed
recorded=false
```

主流程随后执行产品内 `finalizeRuntimeShutdown(profileId, 'liveness-failure')`。因此不能出现浏览器继续运行、控制面却没有可信成功证据的悬空状态。

## 4. 生命周期关闭原因诊断

新增 `CloakBrowserLifecycleDiagnostics`，记录：

- launch 时间；
- trusted 时间；
- 显式关闭意图；
- Browser disconnected 时间；
- 最后页面关闭时间；
- context close 时间；
- trusted 后存活时长；
- context 关闭时剩余页面数；
- context 关闭时 Browser 连接状态。

关闭分类包括：

| 分类 | 含义 |
|---|---|
| `explicit-close` | 产品 stop、graceful shutdown 或 launch-error 等已知关闭意图 |
| `browser-disconnected` | Playwright Browser 发出 disconnected |
| `last-page-closed` | 没有显式关闭意图，且最后页面先关闭 |
| `context-close-unknown` | 当前信号不足以归入以上分类 |

主流程新增或扩展的审计事件包括：

- `cloak_post_trust_liveness_started`
- `cloak_post_trust_liveness_passed`
- `cloak_post_trust_liveness_failed`
- `cloak_browser_disconnected`
- `cloak_last_page_closed`
- `cloak_context_close_diagnosed`
- `cloak_post_trust_liveness_handler_failed`

### 4.1 可观测性边界

当前 CloakBrowser 由 Playwright persistent context 管理，产品代码没有直接持有底层 Chromium `ChildProcess` 对象。Playwright 的 Browser/context 事件可以确认断联和关闭顺序，但不能可靠提供 macOS 进程的 exit code 或 signal。

因此诊断证据明确输出：

```text
processExitCodeAvailable=false
processSignalAvailable=false
```

本阶段没有伪造未知字段，也没有把 Browser disconnected 推断成某个具体 signal。若后续必须取得 OS 级退出码，需要 CloakBrowser wrapper 暴露受支持的进程生命周期接口，或在产品启动器层增加正式 child-process 句柄，而不能依赖猜测。

## 5. 主流程接入

修改：

```text
apps/duokai2/electron/main.ts
```

关键变化：

1. 删除即时 `recordSuccess('trusted')` 路径；
2. trusted 后创建 lifecycle diagnostics；
3. 为 Browser 注册 `disconnected` 监听；
4. 为页面注册最后页面关闭诊断；
5. 为 context close 输出结构化诊断并触发失败 outcome；
6. 将 admission lease 移交 post-trust gate；
7. post-trust 失败时更新 Pilot 状态并通过产品 shutdown 收敛；
8. 正常 stop / graceful shutdown 在门禁未完成时记录中断失败，而不是成功；
9. launch 后续异常会终结待决 gate 并清理生命周期状态。

原有 `convergeRuntimeContextClose(...)` 仍负责同步收敛 scheduler、数据库 Profile 状态和运行映射，避免重新引入 stale `running` 问题。

## 6. 回归测试

新增：

```text
apps/duokai2/electron/services/cloakBrowserPostTrustGate.test.ts
```

覆盖：

- 成功 outcome 在持续门禁前保持空白；
- context 提前关闭写一次失败并抑制迟到成功；
- Browser 探针失活 fail-closed；
- 成功 outcome 写入失败 fail-closed；
- 多个关闭信号保持幂等；
- 显式 stop 与 Browser disconnected 分类；
- 最后页面关闭与未知 context close 分类；
- 主流程不存在即时 `recordSuccess('trusted')`，并已接入新 gate 和诊断事件。

验证结果：

| 验证 | 结果 |
|---|---|
| 聚焦生命周期 / liveness / rollout / context 测试 | `27/27` 通过 |
| TypeScript `tsc -b` | 通过 |
| 完整 `test:cloak-runtime` | `150/150` 通过，`0` 失败，exit code `0` |
| `npm run build:dir` | 通过 |
| ASAR 内容审计 | 通过 |

Task Graph 的一次完整测试摘要把 exit code 0、150/150 通过的命令误标为 timeout。随后通过 owner execution 通道执行同一测试，取得独立干净回执：150 个测试全部通过，exit code 0。该平台摘要异常不代表产品测试失败。

## 7. ASAR 审计

构建产物：

```text
apps/duokai2/release/mac-arm64/Duokai.app/Contents/Resources/app.asar
```

SHA256：

```text
d97acd94e1eb731786158cab11dab35db2b539dc5791d3eaf94116ab20fa33fb
```

从 ASAR 内提取 `dist-electron/main.js` 后确认：

- 包含 `post_trust_liveness_passed`；
- 包含 `post_trust_liveness_failed`；
- 包含 `cloak_context_close_diagnosed`；
- 包含 `post_trust_browser_disconnected`；
- 不包含即时 `recordSuccess('trusted')` 调用。

ASAR 审计证据：

```text
.pilot-runtime/phase6f-post-trust-20260728T122700Z/asar-audit.json
```

## 8. 代码与证据哈希

```text
cloakBrowserPostTrustGate.ts
SHA256 dbbe6d0e90c5d73a7c2eee214b4ff6735302276e56407eab87b8c2a45b0cf121

cloakBrowserPostTrustGate.test.ts
SHA256 9ff9305cea25cbe2578baaf3d6d33b855777627d56cafbabfd928bff59da6d71

main.ts
SHA256 5d506f1d40f7e9e9cae47d962f6a05579f53cb96d269feaaa4e770b2896f0ec2

package.json
SHA256 1e3685cf5cb6d57eb49cf00a107cc71d424a46b91eae522c2f0ce09455e087cf
```

最终安全状态证据：

```text
.pilot-runtime/phase6f-post-trust-20260728T122700Z/final-safety-state.json
```

数据库静态审计副本：

```text
.pilot-runtime/phase6f-post-trust-20260728T122700Z/final-db-snapshot.sqlite
```

## 9. 正式环境最终状态

本阶段没有启动真实 Profile 或 CloakBrowser，也没有写正式控制文件或数据库。最终只读检查确认：

- `试点 Profile`：`stopped`；
- `非目标 Profile`：`stopped`；
- Pilot enabled Profile：空；
- rollout mode：`off`；
- 批次：`enabled=false`；
- 批次 kill switch：`true`；
- 运行锁：不存在；
- production transaction：不存在；
- 正式 Duokai、测试 Duokai、CloakBrowser：均无运行进程；
- 正式数据库源与静态副本 SHA256 一致：
  `b3d83bb7e6e9a6f2924fc1435c55597e4078673f201dbdc6677dab6aa6fed6ac`；
- 静态副本 `quick_check=ok`；
- 静态副本 `integrity_check=ok`。

正式 rollout health 仍保留 Phase 6E 样本 5 的旧 `trusted` 假成功记录。本阶段按边界没有改写历史正式证据；由于 rollout 为 `off`、批次 disabled 且 kill switch 开启，该记录当前不会放行会话。下一次真实 Observe 必须使用全新的 rollout ID 和空 health 窗口，不能复用该旧记录。

## 10. 已知剩余问题

### 10.1 需要真实 Observe 复验

离线测试证明状态机语义和构建接入符合预期，但不能证明真实 CloakBrowser 不会再次在约 60 秒时关闭。下一次真实 Observe 应验证：

1. trusted 后前 60 秒 health 不出现成功 outcome；
2. 若 context 在门禁前关闭，health 写入失败 outcome；
3. 若持续门禁通过，才出现 `post_trust_liveness_passed`；
4. Browser/context 关闭审计能给出明确分类和时间线；
5. 产品 stop 后 Profile、锁和事务立即收敛。

### 10.2 最终单引擎发行包仍未完成

`build:dir` 仍从本机 Playwright 缓存捆绑 Chromium 1208：

```text
chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app
```

因此该构建只用于开发验证，不能作为最终“仅 CloakBrowser”发行物。删除普通 Chromium 打包路径仍需后续独立阶段完成。

## 11. 最终结论

Phase 6F 已完成两项离线修复目标：

- rollout 成功不再在初始 trusted 时提前发布；
- Browser/page/context 关闭具有结构化、可审计的原因分类，并在 post-trust 门禁前失活时产生失败 outcome。

代码、聚焦测试、完整测试、类型检查、构建和 ASAR 审计全部通过。

判定：

- **Phase 6F 离线实现：GO**
- **新的单 Profile Observe 复验：具备申请条件，但尚未执行**
- **Enforce：NO-GO**
- **正式发布：NO-GO**

再次进行真实 Observe 需要新的明确授权；不得直接进入 Enforce。
