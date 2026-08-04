# Phase 6G 真实单 Profile Observe 复验报告

## 1. 结论

Phase 6G 真实 Observe 复验结果：**GO（仅限 Observe 验证）**。

本轮使用 Phase 6F 构建，通过 Duokai 产品 `window.desktop.runtime.launch(profileId)` 启动 `试点 Profile`，并通过产品 `window.desktop.runtime.stop(profileId)` 停止。真实运行证明 Phase 6F 的延迟成功语义按设计生效：

1. Profile 已进入 `trusted/running` 时，新的 rollout health 窗口仍为 `outcomes: []`；
2. 只有产品内 post-trust 持续存活门禁完成后，才写入唯一成功 outcome；
3. 门禁实际持续 `60,146 ms`，采样 `13` 次；
4. outcome 原因严格为 `post_trust_liveness_passed`，不再使用旧的即时 `trusted` 成功；
5. 门禁前没有 Browser disconnected、末页关闭、context 关闭、EPIPE、全局 shutdown 或未处理异常；
6. 产品 stop 后，context 关闭被分类为 `explicit-close`，关闭意图为 `stop`；
7. 两个 Profile 最终均为 `stopped`，运行队列、锁、事务、App、CloakBrowser 和 CDP 监听均已清空；
8. 正式控制面已恢复 fail-closed。

**Enforce 仍为 NO-GO。** 本轮只产生一条 Phase 6F 修复后的真实成功样本，而健康策略要求 `minimumSamples=5`；同时当前桌面发行目录仍捆绑 Playwright Chromium 1208，尚未满足最终 CloakBrowser 单引擎发行要求。

## 2. 执行边界

- 实现与证据工作区：`~/Documents/duokai-cloakbrowser-phase1-poc`
- 分支：`codex/cloakbrowser-phase1-poc`
- 正式参考仓库 `~/Documents/duokai` 未被操作或修改
- 未 commit、merge、push、publish 或 notarize
- 未启用 Enforce
- 仅允许 `试点 Profile` 进入真实 Observe
- `非目标 Profile` 全程保持 `stopped`
- 最大并发为 1
- 任何异常均由专用执行器先尝试产品 stop，再恢复 fail-closed

Task Graph：

```text
task_dcff9366-4328-49d1-bf81-f04dd93e66fc
```

## 3. 目标与身份

### 3.1 目标 Profile

| 项目 | 值 |
| --- | --- |
| Profile 名称 | `试点 Profile` |
| Profile ID | `<pilot-profile-id>` |
| 对照 Profile | `非目标 Profile` |
| 对照 Profile ID | `<non-target-profile-id>` |

### 3.2 Rollout 身份

| 项目 | 值 |
| --- | --- |
| rollout ID | `phase6g-post-trust-observe-20260728T133722939Z` |
| batch ID | `single-linkedin1-phase6g` |
| 模式 | `observe`，结束后恢复 `off` |
| 最大并发 | `1` |
| 初始 health | 空 outcome 窗口 |

### 3.3 二进制身份

| 项目 | 值 |
| --- | --- |
| App ASAR SHA256 | `d97acd94e1eb731786158cab11dab35db2b539dc5791d3eaf94116ab20fa33fb` |
| CloakBrowser 版本 | `145.0.7632.109.2` |
| CloakBrowser SHA256 | `79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79` |

## 4. 预检

正式运行前确认：

- 测试 App 未运行；
- CloakBrowser 未运行；
- `/Applications/Duokai.app` 未运行；
- CDP 端点 `54264` 无监听；
- Pilot 名单为空；
- rollout 模式为 `off`；
- 原批次 disabled 且 kill switch 开启；
- `试点 Profile`、`非目标 Profile` 均为 `stopped`；
- 运行、排队和启动中队列均为空；
- runtime lock 与 production transaction 均不存在；
- Phase 6F ASAR 与固定 CloakBrowser 二进制哈希均未漂移。

## 5. 产品启动路径

专用执行器打开 Phase 6F 打包 App，并通过渲染进程产品桥接调用：

```text
window.desktop.runtime.launch("<pilot-profile-id>")
```

本轮没有直接启动裸 CloakBrowser，也没有绕过 Duokai 的调度、网络预检、快照签名、可信发布、数据库状态与生命周期管理。

关键时间线：

| 事件 | UTC 时间 |
| --- | --- |
| 执行器开始 | `2026-07-28T13:37:22.939Z` |
| 产品 launch 请求 | `2026-07-28T13:37:29.091Z` |
| Cloak context 启动 | `2026-07-28T13:38:52.817Z` |
| trusted 审计发布 | `2026-07-28T13:39:16.001Z` |
| post-trust gate 开始 | `2026-07-28T13:39:16.020Z` |
| 外部观察到 trusted/running | `2026-07-28T13:39:17.456Z` |
| post-trust outcome 写入 | `2026-07-28T13:40:16.166Z` |
| 产品 stop 请求 | `2026-07-28T13:40:22.613Z` |
| context 关闭 | `2026-07-28T13:40:25.115Z` |
| stopped 状态确认 | `2026-07-28T13:40:27.638Z` |
| 执行器完成 | `2026-07-28T13:40:27.836Z` |

## 6. 延迟成功语义验证

### 6.1 trusted 时不得提前写 outcome

在 `试点 Profile` 已经达到：

```text
profile.status=running
pilot.state=trusted
```

时，读取到的 rollout health 为：

```json
{
  "rolloutId": "phase6g-post-trust-observe-20260728T133722939Z",
  "outcomes": []
}
```

因此旧的“trusted 即写 success”假绿灯路径已在真实产品运行中被消除。

### 6.2 产品内持续存活门禁

产品审计记录：

```text
action=cloak_post_trust_liveness_started
minimumDurationMs=60000
```

门禁完成后记录：

```text
action=cloak_post_trust_liveness_passed
durationMs=60146
sampleCount=13
reason=post_trust_liveness_passed
recorded=true
```

对应 health 中唯一 outcome：

```json
{
  "profileId": "<pilot-profile-id>",
  "batchId": "single-linkedin1-phase6g",
  "success": true,
  "reason": "post_trust_liveness_passed",
  "at": "2026-07-28T13:40:16.166Z"
}
```

门禁前和门禁完成时均未发现：

- `cloak_post_trust_liveness_failed`
- `cloak_browser_disconnected`
- `cloak_last_page_closed`
- `cloak_context_close_diagnosed`
- `write EPIPE`
- `process_shutdown_begin`
- `main_window_close`
- unhandled rejection 或 uncaught exception

## 7. Trusted 与网络证据

Trusted snapshot：

| 项目 | 值 |
| --- | --- |
| Snapshot ID | `888fcdca-6f85-46fd-a4c8-fbe0c9ccc2d9` |
| signedAt | `2026-07-28T13:39:15.973Z` |
| startupNavigationPassed | `true` |
| binary SHA256 | 固定 CloakBrowser SHA256，匹配 |

运行网络诊断：

| 项目 | 值 |
| --- | --- |
| level | `ok` |
| egress IP | `5.42.159.43` |
| country | `France` |
| region | `Ile-de-France` |
| timezone | `Europe/Paris` |
| engine | `cloakbrowser` |

## 8. 稳定观察与产品 Stop

从外部首次观察到 trusted 到最终证据完成，共持续 `70,380 ms`。成功 outcome 写入后，Profile 继续保持 `trusted/running`，health 始终只有一条成功记录，没有被覆盖、重复追加或漂移到其他 rollout。

随后通过产品桥接调用：

```text
window.desktop.runtime.stop("<pilot-profile-id>")
```

停止过程的结构化诊断：

```text
classification=explicit-close
closeIntent=stop
postTrustGatePending=false
lifetimeAfterTrustMs=69095
browserConnectedAtClose=true
```

在 context 关闭后出现 Browser disconnected 属于产品主动 stop 的正常尾部事件。关闭发生时 post-trust gate 已经完成，因此没有产生失败 outcome，也没有造成成功记录撤销或重复写入。

当前 Playwright/CloakBrowser 接口仍不能提供底层 Chromium OS exit code 或 signal；本报告保持 `processExitCodeAvailable=false`、`processSignalAvailable=false`，没有推测填充。

## 9. 最终状态

### 9.1 Profile 与调度器

- `试点 Profile`：`stopped`
- `非目标 Profile`：`stopped`
- running 列表：空
- queued 列表：空
- starting 列表：空
- 两个 launch stage：`idle`

### 9.2 锁和事务

- `.duokai-runtime-lock.json`：不存在
- `.duokai-cloak-pilot/production-transaction.json`：不存在

### 9.3 进程和监听

- Phase 6F 测试 App：未运行
- CloakBrowser：未运行
- 正式安装 Duokai：未运行
- CDP `54264`：无监听

`localPortStatus` 使用 `lsof`，退出码 1 表示没有匹配的监听进程；该结果在此处按“端点已清空”解释，而不是产品失败。

### 9.4 Fail-closed 控制

最终正式控制为：

```text
Pilot enabledProfileIds=[]
rollout mode=off
batch enabled=false
batch killSwitch=true
maxConcurrentSessions=1
```

health 保留本轮唯一、可审计的真实成功 outcome；未启用 Enforce。

## 10. 数据库审计

在所有相关 App 和 CloakBrowser 均关闭后，对正式数据库制作静态审计副本。副本 SHA256 与正式库完全一致：

```text
caa55a6d53eb2b71064ff04b414870a56c1e6fd0fa5bcdfd512ca577a403226b
```

使用 SQLite `immutable=1` 对副本检查：

```text
PRAGMA quick_check    = ok
PRAGMA integrity_check = ok
```

Profile 状态：

| Profile | 状态 |
| --- | --- |
| `试点 Profile` | `stopped` |
| `非目标 Profile` | `stopped` |

正式数据库未通过审计脚本写入；静态副本只用于只读完整性验证。

## 11. 判定

### 11.1 Phase 6G

**GO（真实 Observe 复验通过）**。

已证明：

- trusted 时不会提前发布 rollout 成功；
- 成功 outcome 只在 60 秒、13 样本产品门禁完成后写入；
- 会话在门禁期间没有复现 Phase 6E 样本 5 的约 60 秒自行失活；
- 产品 stop 能正确区分主动关闭与异常关闭；
- 数据库和运行状态能够无 App 重启地收敛；
- fail-closed 可以在本轮结束后恢复。

### 11.2 Enforce 与发布

**NO-GO**，原因：

1. Phase 6F 修复后的真实 Observe 样本目前只有 1 条，尚未满足 `minimumSamples=5`；
2. Phase 6E 的旧样本使用修复前成功语义，不能直接作为 Phase 6F 门禁实现的等价验证样本；
3. 当前桌面构建仍捆绑 Playwright Chromium 1208，最终单引擎发行包未完成；
4. 本轮授权仅覆盖 Observe，不包含 Enforce、发布、签名或公证。

## 12. 证据索引

证据目录：

```text
~/Documents/duokai-cloakbrowser-phase1-poc/.pilot-runtime/phase6g-observe-20260728T133000Z
```

关键文件：

```text
control-manifest.json
preflight.json
launch-result.json
trusted-status.json
post-trust-gate.json
stability-samples.json
audit-before-stop.json
stopped-status.json
failclosed-control.json
result.json
db-audit.json
final-db-snapshot.sqlite
final-state.json
```

关键 SHA256：

| 文件 | SHA256 |
| --- | --- |
| `run-real-observe.mjs` | `9b40540cb59fa4830784fced1b75787d30d921cefd4edba5127d5809bf8d4d17` |
| `result.json` | `be9c230632a0485c8ef5ad49c24b1861a906c79b208399dc3c860e2bdb521f53` |
| `post-trust-gate.json` | `fdd8af5e88289d566e7ee30eb47bebdacfdb9f3ff1a83e50c71b577b64864947` |
| `failclosed-control.json` | `71752736957c0748f278bac187b16dffc1a7e57a509e71c77193c00d1e8e89f5` |
| `db-audit.json` | `cf917df66a0e2ab644a96ad133544d017d2f32f21c74e3206af46534b62a3cb2` |
| `final-db-snapshot.sqlite` | `caa55a6d53eb2b71064ff04b414870a56c1e6fd0fa5bcdfd512ca577a403226b` |
| `final-state.json` | `f5d82852a472e463a0c6c9082041c235d3b6682dd079fa9874bd0c97218aa4ff` |

## 13. 后续建议

下一阶段应优先进行 **Phase 6H：单引擎发行包硬化**，在纯离线条件下移除 Playwright Chromium 1208 的打包和普通 Chromium 回退语义，并完成依赖、构建及 ASAR/native 资产审计。完成最终单引擎包后，再使用最终发行包建立新的真实 canary 样本窗口。

若选择先扩充 Observe 样本，也必须使用 Phase 6F 之后的同一成功语义、独立 rollout ID 和空 health 窗口，并需要新的明确授权；不得把本轮 GO 自动解释为 Enforce 授权。
