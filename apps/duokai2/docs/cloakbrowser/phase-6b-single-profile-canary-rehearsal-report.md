# Phase 6B：单 Profile Canary 离线演练审计报告

- 日期：2026-07-28
- 隔离工作区：`~/Documents/duokai-cloakbrowser-phase1-poc`
- Task Graph：`task_b0aa5c76-1067-4982-95e8-09a9e8d4cea2`
- 前置阶段：Phase 6A 已完成
- 结论：完成；本阶段仅建立离线、不可直接上线的单 Profile canary 演练与晋级授权能力。

## 1. 本阶段目标

Phase 6B 将 Phase 6A 已具备的 Pilot 白名单、`off / observe / enforce` 控制面、批次、健康熔断和停机开关，收敛为一套可审计的单 Profile canary 演练门禁。

本阶段只允许：

1. 读取显式 Pilot 配置、rollout control 和 rollout health 证据；
2. 对单一虚构或专用 Profile 做离线就绪判定；
3. 计算精确的目标 `enforce` 控制内容和哈希；
4. 生成短时、可验签的本机 HMAC 授权收据；
5. 使用临时目录和模拟证据完成测试与 smoke。

本阶段明确不允许：

- 启用任何真实 Profile；
- 启动 CloakBrowser、Playwright Chromium 或其他浏览器；
- 写入正式 `pilot-config.json`、`rollout-control.json`、`rollout-health.json`；
- 修改正式数据库或正式目录 `~/Documents/duokai`；
- 将离线演练模块接入 Electron 主进程、preload 或 renderer；
- commit、merge 或 push。

## 2. 实现内容

### 2.1 离线演练服务

新增：

`apps/duokai2/electron/services/cloakBrowserCanaryRehearsal.ts`

核心入口：

- `evaluateCloakCanaryRehearsal(...)`
- `signCloakCanaryAuthorization(...)`
- `verifyCloakCanaryAuthorization(...)`

演练报告绑定以下不可替换的证据：

- 单一 `profileId`；
- 单一 `rolloutId`；
- 单一 `batchId`；
- 当前 Pilot 配置哈希；
- 当前 rollout control 哈希；
- 当前 rollout health 哈希；
- 固定 CloakBrowser 版本；
- 固定 CloakBrowser 二进制 SHA256；
- 预生成目标 `enforce` control 哈希；
- 报告生成时间和短时失效时间；
- operator / reviewer 审批声明。

### 2.2 Fail-closed 门禁

演练只有在下列条件全部成立时才返回 `ready=true`：

- 请求中的 rehearsal、Profile、rollout、batch ID 均为具体值，禁止通配符；
- 存在显式 Pilot 配置；
- Pilot 配置只启用一个 Profile，且必须等于本次演练 Profile；
- 存在显式 rollout control；
- 来源模式必须为 `observe`；
- rollout ID 必须精确匹配；
- 浏览器版本和二进制 SHA256 必须与固定发布身份一致；
- rollout 只允许一个批次；
- 批次只允许一个 Profile，且 `maxConcurrentSessions=1`；
- 全局和批次停机开关均未触发；
- 演练 Profile 不得处于 running、queued 或 starting；
- Phase 6A admission 结果必须干净且不会阻断。

从 `observe` 晋级到 `enforce` 时还要求：

- 达到最低成功样本数；
- 失败样本不超过预算；
- 观察证据覆盖最低持续时间；
- 最新样本足够新鲜；
- 最新结果必须成功；
- operator 与 reviewer 声明均存在且必须是不同标识；
- 审批时间必须晚于最新观察证据，且不得来自未来。

任一检查失败时，报告不可签名，也不会产生可用的晋级授权。

### 2.3 授权收据语义

授权收据使用 `HMAC-SHA256` 和现有 Cloak 本机签名密钥提供者。

该签名只证明：

- 本机报告内容未被篡改；
- 报告、来源证据哈希和目标控制哈希保持一致；
- 收据仍在短时有效期内；
- 使用的本机 key ID 可被当前 keyring 验证。

该签名不证明：

- operator 或 reviewer 的远程身份；
- 两个人确实完成了外部身份认证；
- 已获得真实生产发布许可；
- 可以绕过下一阶段的显式人工授权。

### 2.4 测试和 smoke

新增：

- `apps/duokai2/electron/services/cloakBrowserCanaryRehearsal.test.ts`
- `apps/duokai2/scripts/run-cloak-canary-rehearsal-smoke.ts`

更新：

- `apps/duokai2/package.json`
  - 将 Phase 6B 测试加入 `test:cloak-runtime`；
  - 新增 `smoke:cloak-canary-rehearsal`。

离线 smoke 仅在系统临时目录创建模拟 Pilot、control 和 health 文件，结束后删除临时目录。

## 3. 离线 Smoke 证据

命令：

`npm run smoke:cloak-canary-rehearsal`

结果：通过，退出码 0。

关键输出：

- `success=true`
- `offlineOnly=true`
- `browserStarted=false`
- `productionControlWritten=false`
- Profile：`offline-dedicated-canary`
- rollout：`phase-6b-offline-smoke`
- batch：`single-canary`
- 来源 control 哈希：`0deaf7469007609488b59b48bb923f126c5f1ab5979d584491ea09eacb3617e1`
- 目标 control 哈希：`2dbd78c8ab610c63cf500b8324e3618c8429f0755ae9aa78a4edf2354f96e5cc`
- 报告哈希：`40a42c33f1911687d5093c87e9226d304250cb476625627e0d9feec4b169ebdd`

所有就绪、观察证据和审批检查均通过。

## 4. 验证矩阵

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| Phase 6B 专项测试 | 通过 | 9/9，失败 0，退出码 0 |
| 完整 Cloak 组合回归 | 通过 | 128/128，失败 0，精简 reporter 重跑退出码 0 |
| TypeScript | 通过 | `tsc -b --pretty false`，退出码 0 |
| 离线 smoke | 通过 | 不启动浏览器、不写正式控制文件 |
| 目录构建 | 通过 | `npm run build:dir`，生成 `release/mac-arm64/Duokai.app` |
| Git 空白错误检查 | 通过 | `git diff --check`，退出码 0 |
| Electron 入口隔离 | 通过 | main、preload、renderer 无演练模块导入 |
| 构建 bundle 隔离 | 通过 | `dist-electron/main.js` 不含演练授权逻辑或 smoke 标记 |
| ASAR / Resources 隔离 | 通过 | 6745 个 ASAR 条目无演练源码、正式控制文件或授权收据 |

### 4.1 测试适配器假阳性说明

第一次运行 `npm run test:cloak-runtime` 时，Node TAP 已明确输出：

- tests：128
- pass：128
- fail：0
- exitCode：0
- 实际持续时间约 1.3 秒

但 DevSpace 验证适配器错误附加了 `Command timed out` 状态。为避免歧义，随后使用相同 17 个测试文件和 `--test-reporter=dot` 重跑，得到干净的退出码 0 和 128 项全部通过证据。该事件属于验证结果解析假阳性，不是产品测试失败。

## 5. 构建产物隔离审计

构建成功生成：

`apps/duokai2/release/mac-arm64/Duokai.app`

审计结果：

- Electron main、preload 和 renderer 源码没有导入 `cloakBrowserCanaryRehearsal`；
- `dist-electron/main.js` 不包含：
  - `duokai-cloak-canary-authorization-v1`
  - `evaluateCloakCanaryRehearsal`
  - `offline-dedicated-canary`
  - `run-cloak-canary-rehearsal-smoke`
- `app.asar` 共 6745 个条目；
- ASAR 中未发现演练服务、演练测试、smoke 脚本；
- ASAR 和 App Resources 中未发现：
  - `pilot-config.json`
  - `rollout-control.json`
  - `rollout-health.json`
  - canary authorization JSON 收据。

因此 Phase 6B 能力目前只是源码侧、测试侧的离线审计工具，不可由当前桌面应用直接触发。

## 6. 已知构建遗留

现有 `build:dir` 流程仍从本机 Playwright 缓存打包 `chromium-1208`。这是 Phase 6B 之前已经存在的打包行为：本阶段没有新增、调用或迁移该浏览器路径，也没有通过它启动任何会话。

但从最终“单引擎 CloakBrowser”目标看，旧 Playwright Chromium 资源打包仍是后续阶段必须移除或替换的明确遗留；在完成单引擎产物验收前，不应把当前构建描述为最终单引擎发行包。

## 7. 安全复核

本阶段实际结果：

- 未选择或启用真实 Profile；
- 未启动任何浏览器；
- 未写正式 Pilot、rollout control 或 health 文件；
- 未写正式 canary authorization 收据；
- 未修改正式数据库；
- 未操作 `~/Documents/duokai`；
- 所有文件变更均位于隔离 worktree；
- 未 commit；
- 未 merge；
- 未 push；
- 未把离线演练能力暴露给 Electron IPC 或用户界面。

## 8. 完成判定

Phase 6B 完成。

现在已具备一套可测试、可审计、默认 fail-closed 的单 Profile canary 离线演练门禁，可以在不触碰真实生产状态的前提下验证：

- 单 Profile / 单批次约束；
- observe 证据质量；
- 停机和 admission 状态；
- 双人审批声明；
- 固定二进制身份；
- 精确目标 control 哈希；
- 短时授权收据完整性。

## 9. 下一阶段门禁

真实单 Profile canary 不属于本阶段成果，且不得自动开始。进入真实演练前必须另行获得明确授权，并至少满足：

1. 明确指定一个可丢弃、可回滚的专用 Profile；
2. 对该 Profile 数据和正式控制文件完成备份；
3. 指定真实 operator 和 reviewer，并在外部流程中确认身份；
4. 固化启动前检查、停止命令和回滚步骤；
5. 确认停机开关可由独立路径触发；
6. 先运行 observe，再基于真实证据生成短时晋级授权；
7. 对任何浏览器启动、正式控制写入或数据库变化再次取得明确许可；
8. 在单引擎发行前处理现有 Playwright Chromium 1208 打包遗留。
