# Phase 6A：小范围灰度发布与运维门禁报告

日期：2026-07-28
工作区：`~/Documents/duokai-cloakbrowser-phase1-poc`
分支：`codex/cloakbrowser-phase1-poc`
Task Graph：`task_57d5ccc2-6bb5-48a0-8fdb-2b04fadef901`

## 1. 结论

Phase 6A 已完成并通过验证，状态为：

> **灰度发布和运维门禁已实现、默认关闭、尚未启用任何真实 Profile。**

本阶段在 Phase 5D 的精确 Profile Pilot 之上增加了本机 sidecar 控制面，提供：

- `off`、`observe`、`enforce` 三种运行模式；
- 仅按明确 Profile ID 建立灰度批次，不支持百分比自动入组或通配符；
- 全局停机开关；
- 批次启停和批次停机开关；
- 批次并发上限；
- 有界健康样本、失败率和连续失败熔断；
- 熔断冷却后的单次探测机会；
- admission 决策、结果记录和跳过原因审计；
- 原子、私有权限的本地控制与健康状态文件；
- rollout 切换后拒绝旧会话污染新健康窗口；
- Pilot 被门禁阻断时 fail-closed，绝不回退到旧浏览器引擎。

没有执行 commit、merge、push、添加远程、修改全局 Git 配置、启用真实 Profile 或修改正式数据库结构。

## 2. 变更范围

### 新增

- `apps/duokai2/electron/services/cloakBrowserRolloutControl.ts`
- `apps/duokai2/electron/services/cloakBrowserRolloutControl.test.ts`
- `apps/duokai2/scripts/run-cloak-rollout-control-smoke.ts`
- `apps/duokai2/docs/cloakbrowser/phase-6a-canary-rollout-operations-report.md`

### 修改

- `apps/duokai2/electron/main.ts`
- `apps/duokai2/package.json`

### 未修改

- 正式数据库 schema 和迁移；
- Profile 持久化模型；
- Cloak 固定版本安装收据格式；
- Phase 5D snapshot、keyring 和 transaction journal 格式；
- 旧浏览器的普通启动逻辑；
- 真实 Profile、真实代理和用户业务数据。

## 3. 控制面文件

控制文件：

```text
<electron-userData>/cloak-pilot/rollout-control.json
```

健康文件：

```text
<electron-userData>/cloak-pilot/rollout-health.json
```

Unix 权限：

- 父目录：`0700`
- 控制文件：`0600`
- 健康文件：`0600`

两类文件均采用临时文件、`fsync`、原子 `rename` 和目录 `fsync`。权限过宽、JSON 损坏、schema 不匹配或固定 Cloak 身份漂移时 fail-closed。

控制文件和健康文件中的 SHA-256 是确定性审计哈希，**不是签名、MAC、远程授权或硬件证明**。

## 4. 控制模式

### `off`

- 缺少控制文件时的默认模式；
- 完全保留 Phase 5D 行为；
- 不读取健康文件，因此损坏或权限异常的健康文件不会影响未启用的 Phase 6A；
- 不执行批次、熔断或并发限制。

### `observe`

- 计算完整 admission 结果；
- 记录 `wouldBlock` 和具体原因；
- 不阻断启动；
- 用于在实际 enforce 前验证批次和门槛是否合理。

### `enforce`

- 强制执行全局/批次停机开关、精确批次资格、健康熔断和并发上限；
- 被阻断的 Pilot 直接失败；
- 不会自动转入旧 Chromium 或其他浏览器实现。

## 5. 控制文件示例

以下仅为 schema 示例，未写入真实 `userData`：

```json
{
  "schemaVersion": 1,
  "mode": "observe",
  "rolloutId": "phase-6a-canary-001",
  "globalKillSwitch": false,
  "targetBrowserVersion": "145.0.7632.109.2",
  "targetBinarySha256": "79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79",
  "batches": [
    {
      "id": "canary-a",
      "enabled": true,
      "killSwitch": false,
      "profileIds": ["EXACT_PROFILE_ID"],
      "maxConcurrentSessions": 1
    }
  ],
  "healthPolicy": {
    "sampleWindowSize": 20,
    "minimumSamples": 5,
    "maxFailureRate": 0.25,
    "maxConsecutiveFailures": 3,
    "cooldownMs": 900000
  },
  "updatedAt": "2026-07-28T00:00:00.000Z"
}
```

约束：

- `rolloutId`、批次 ID 和 Profile ID 必须是明确值；
- `*`、空值、换行和重复批次分配被拒绝；
- 一个 Profile 不能同时属于两个批次；
- Cloak 版本和二进制 SHA 必须与固定 Pilot 身份完全一致；
- `minimumSamples` 不能大于样本窗口；
- 并发数和健康门槛必须处于受限范围。

## 6. Admission 决策顺序

对已通过 Phase 5D 精确 Profile Pilot 资格检查的启动请求，Phase 6A 按以下优先级计算：

1. `control_off`
2. `invalid_profile_id`
3. `global_kill_switch`
4. `profile_not_in_batch`
5. `batch_disabled`
6. `batch_kill_switch`
7. `health_circuit_open`
8. `concurrency_limit`
9. `admitted`

`observe` 会返回相同原因，但仍允许启动；`enforce` 会阻断所有 `wouldBlock=true` 的结果。

每次决策审计包含：

- Profile ID；
- mode、rollout ID 和 batch ID；
- admitted、wouldBlock、enforced；
- 具体原因；
- control hash；
- 当前批次活跃数和并发上限；
- 样本数、失败率、连续失败、冷却结束时间和 circuit 状态。

## 7. 并发与健康状态

### 启动并发

`CloakRolloutGovernor` 同时统计：

- 已进入 `runtimeCloakPilots` 的活跃 Profile；
- 正在启动、尚未完成可信发布的保留 Profile。

成功会话先进入活跃集合，再释放 admission 保留项，避免出现短暂的并发计数空档。释放操作幂等。

### 结果追加

同一 Electron 主进程内的结果写入通过串行队列执行，避免多个会话同时完成时发生读改写覆盖。每个 admission lease 最多写入一次成功或失败结果。

结果原因会去除控制字符并限制长度，避免审计状态被换行或超长错误污染。

### Rollout 切换

结果写入前重新读取当前控制文件。以下情况会跳过旧会话结果：

- 控制模式已经切换为 `off`；
- 当前 `rolloutId` 与 admission 时不同；
- 原批次已删除或 Profile 已不再属于该批次。

跳过行为通过 `cloak_rollout_outcome_skipped` 审计，不会把旧批次失败写入新 rollout。

### 熔断

健康窗口按批次维护并限制最大长度。以下任一门槛可触发 circuit：

- 样本数达到 `minimumSamples` 后，失败率超过 `maxFailureRate`；
- 连续失败达到 `maxConsecutiveFailures`。

只要最新失败仍在 `cooldownMs` 范围内，`enforce` 模式拒绝新启动。冷却结束后允许一次新探测；新的结果会重新决定后续状态。

## 8. 主进程接入顺序

1. 读取 Phase 5D 本地精确 Profile Pilot 配置；
2. 判断当前 Profile 是否满足 Pilot 资格；
3. 仅对已启用 Pilot 的 Profile 请求 Phase 6A admission；
4. 写入 `cloak_rollout_decision` 审计；
5. 若 `enforce` 阻断，立即失败且不执行浏览器 fallback；
6. 继续 Phase 5D 网络验证、安装收据、Cloak 启动和可信事务；
7. 事务失败时记录一次失败结果；
8. 事务达到 `trusted` 后，将会话加入活跃集合并记录一次成功结果；
9. rollout 已切换时跳过过期结果并记录跳过审计；
10. 任意异常路径释放 admission 保留项并清理 Pilot 会话。

Phase 6A 不改变 Phase 5D 的可信发布顺序，也不在 trusted 之前发布成功状态。

## 9. 审计事件

新增事件：

- `cloak_rollout_decision`
- `cloak_rollout_outcome_recorded`
- `cloak_rollout_outcome_skipped`
- `cloak_rollout_outcome_write_failed`

阻断原因仍会进入 Profile Pilot 状态，例如：

```text
rollout_global_kill_switch
rollout_batch_kill_switch
rollout_health_circuit_open
rollout_concurrency_limit
```

原始 rollout 原因不会被外层错误保护泛化为普通 `launch_failed`。

## 10. 验证结果

### Focused tests

```text
13/13 passed
```

覆盖：

- 默认关闭；
- observe/enforce；
- 全局和批次停机开关；
- 精确批次与重复分配；
- 固定身份漂移；
- 活跃与保留并发计数；
- 失败率和连续失败熔断；
- 冷却探测；
- 有界健康窗口；
- 私有权限；
- `off` 绕过损坏健康文件；
- admission 竞态；
- 一次性结果；
- 并发结果串行追加；
- rollout 切换隔离。

### Combined Cloak tests

```text
119/119 passed
0 failed
0 skipped
```

### TypeScript

```text
../../node_modules/.bin/tsc -b --pretty false
exitCode=0
```

### Isolated operations smoke

```text
npm run smoke:cloak-rollout-control
success=true
```

通过项：

- default off preserved；
- observe does not block；
- enforce exact batch admission；
- concurrent launch blocked；
- health circuit blocked；
- batch kill blocked；
- control/health mode `600`；
- fixed Cloak identity matched。

Smoke 只使用 OS 临时目录，结束后删除临时根；未读取正式数据库、未启动浏览器、未接触真实 Profile。

### Existing production transaction smoke

```text
DUOKAI_CLOAK_POC_CACHE_DIR=~/.cloakbrowser npm run smoke:cloak-production-pilot
success=true
```

Phase 5D 的签名、安装预检、可信事务、失败回滚和 no-fallback 语义保持通过。

### macOS arm64 build

```text
npm run build:dir
exitCode=0
```

产物：

```text
~/Documents/duokai-cloakbrowser-phase1-poc/apps/duokai2/release/mac-arm64/Duokai.app
```

构建使用 ad-hoc 签名；notarization 按现有配置关闭。

### ASAR audit

```json
{
  "totalEntries": 6745,
  "cloakWrapperEntries": 74,
  "playwrightCoreEntries": 398,
  "cloakBinaryEntries": 0,
  "mainBytes": 526777
}
```

以下标记全部存在：

- `rollout-control.json`
- `rollout-health.json`
- `cloak_rollout_decision`
- `cloak_rollout_outcome_recorded`
- `cloak_rollout_outcome_skipped`
- `global_kill_switch`
- `health_circuit_open`
- `concurrency_limit`

Cloak Chromium 固定二进制仍位于外部管理缓存，没有被静默打进应用。

### Source and Git checks

- Phase 6A 文件无 CRLF；
- 无 merge conflict 标记；
- 无行尾空白；
- `package.json` 可正常解析；
- `git diff --check`：通过。

Phase 6A 最终 Git 范围：

```text
 M apps/duokai2/electron/main.ts
 M apps/duokai2/package.json
?? apps/duokai2/electron/services/cloakBrowserRolloutControl.test.ts
?? apps/duokai2/electron/services/cloakBrowserRolloutControl.ts
?? apps/duokai2/scripts/run-cloak-rollout-control-smoke.ts
?? apps/duokai2/docs/cloakbrowser/phase-6a-canary-rollout-operations-report.md
```

## 11. 未执行与剩余限制

本阶段有意未执行：

- 未写入正式 `rollout-control.json`；
- 未把任何真实 Profile 加入批次；
- 未切换到 `observe` 或 `enforce`；
- 未使用真实代理或业务网站；
- 未修改正式数据库；
- 未提供 UI 或 IPC 运维控制入口；
- 未实现远程控制面、远程签名策略或集中遥测；
- 未自动终止已经运行的 Pilot 会话；停机开关只阻断后续启动；
- 未实现多应用进程或多主机之间的分布式锁和健康聚合；当前串行保证限定于一个 Electron 主进程；
- 未执行百分比或哈希自动分流，避免非预期扩大灰度范围；
- 未执行正式 Developer ID 签名或 notarization；
- 未 commit、merge 或 push。

控制面当前是本机文件模型。正式运维前仍需要：

1. 明确谁有权创建和修改控制文件；
2. 增加经过认证的管理命令或受控发布流程；
3. 规定 `observe` 的最短观察周期与升级 `enforce` 的人工审批；
4. 定义已运行会话的紧急终止策略；
5. 决定是否引入签名控制文件、集中审计和跨主机健康聚合；
6. 使用专用测试 Profile 完成首次真实 canary，而不是直接使用用户 Profile。

## 12. 最终状态

Phase 6A 的代码、测试、构建和产物审计均通过，可进入下一阶段的**受控单 Profile canary 演练设计**。

当前仍保持：

- Pilot 默认关闭；
- rollout 默认 `off`；
- 精确 Profile ID 才可能进入灰度；
- 固定 Cloak 版本和 SHA；
- 启动时不自动下载；
- Pilot 路径不 fallback；
- 没有真实灰度流量。
