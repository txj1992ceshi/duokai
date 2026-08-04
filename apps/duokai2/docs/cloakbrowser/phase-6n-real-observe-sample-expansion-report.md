# Phase 6N 五次真实 Observe 串行样本扩展报告

## 结论

- Phase 6N：**BLOCKED**。
- Observe 样本扩展：**NO-GO**。
- Enforce：**NO-GO**。
- 正式发布：**NO-GO**。
- 本阶段没有形成成功或失败健康样本；Phase 6M 的有效真实样本保持有效且未被改写。

## 计划范围

- 目标 Profile：`试点 Profile`（`<pilot-profile-id>`）。
- 非目标 Profile：`非目标 Profile`（`<non-target-profile-id>`），禁止启动。
- 最多 5 次真实、串行 Observe；每次使用新 rollout、batch、CDP 端口和一次性 nonce。
- 无并发；任何异常立即停止，不重试、不重新打开。
- 不提交、不合并、不推送、不发布；正式仓库 `~/Documents/duokai` 未修改。

## 基线与预检

- Phase 6M 已封存，Observe 结论为 GO；其报告 SHA256 为 `dd5e897af0e121ec448f0cff0ea26541f0be1e11707b43737d3a204d77225764`。
- Phase 6N r1 runner SHA256：`47140faf09755553bc379675cbdad058938b131ef105fc60e1af462b12d2af3a`。
- 硬化包 `app.asar` SHA256：`7173e2bf5f9f454609ff57bcd2405b1b15d1ca25da816f71999672062f208465`。
- CloakBrowser Chromium SHA256：`79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79`。
- App 未运行；预留端口 `55431–55435` 无监听。
- 目标与非目标 Profile 均无 runtime lock 或 production transaction。
- `desktop.db` 的 `PRAGMA quick_check` 与 `PRAGMA integrity_check` 均返回 `ok`。
- 控制处于 fail-closed：Pilot 空列表、rollout `off`、global kill switch 开启、batch 禁用且 kill switch 开启。

## r1 阻断

r1 计划使用：

- rollout：`phase6n-observe-20260728T191708Z-r1`
- batch：`single-linkedin1-phase6n-r1`
- CDP：`127.0.0.1:55431`

在 `prepare` 阶段，runner 调用原子控制写入逻辑时，对以下目录执行权限校正：

`~/Library/Application Support/duokai2-desktop/cloak-pilot`

命令运行环境返回：

- error：`CloakPilotLocalConfigError`
- code：`config_io_failed`
- cause：`EPERM`
- syscall：`chmod`

结构化执行证据显示该命令使用 `workspaceWrite`，可写根仅限实现工作区；目标控制目录位于工作区外。后续只读核验同时确认控制目录归属当前用户，目录模式已经是 `0700`，三份控制文件已经是 `0600`。因此该异常分类为 **执行通道权限边界阻断**，不是产品运行时、CloakBrowser 或 Profile 生命周期失败。

## 未发生的操作

- 未创建新的 Electron CDP request 或 receipt。
- 未调用 `localAppOpen`。
- 未启动硬化 Duokai App。
- 未调用产品 `runtime.launch`。
- 未启动 CloakBrowser。
- 未启动 `试点 Profile` 或 `非目标 Profile`。
- 未发布 rollout 健康成功或失败结果。
- 未执行 r2–r5。
- 未重试或重新打开。

## 恢复核验

- 三份控制文件内容和时间戳保持 Phase 6M fail-closed 原值。
- Pilot `enabledProfileIds=[]`。
- rollout `mode=off`、`globalKillSwitch=true`。
- batch `enabled=false`、`killSwitch=true`。
- 新 CDP request/receipt：无。
- 硬化 App：未运行。
- 端口 `55431`：无监听。
- 两个 Profile 的 runtime lock 与 production transaction：均不存在。
- 数据库 quick/integrity：`ok/ok`。

## 样本统计

- 计划真实样本：5。
- prepare 尝试：1。
- App 启动：0。
- Profile 启动：0。
- 有效健康样本：0。
- 健康成功样本：0。
- 健康失败样本：0。
- r2–r5：按异常立即停止规则未执行。

## 证据

- `.pilot-runtime/phase6n-observe-20260728T191708Z/run-phase6n-observe-r1.mjs`
- `.pilot-runtime/phase6n-observe-20260728T191708Z/attempt-r1/preexisting-controls.json`
- `.pilot-runtime/phase6n-observe-20260728T191708Z/attempt-r1/prepare-failure.json`
- `.pilot-runtime/phase6n-observe-20260728T191708Z/aggregate-result.json`

## 后续门槛

再次进行真实样本扩展前，应先建立一个明确授权、能够访问产品 Application Support 控制目录的本地执行通道，并离线验证它只允许预期的控制写入与启动动作。该修复不得通过降低目录/文件权限、跳过原子写入或绕过 fail-closed 校验来实现。随后必须创建新的阶段、新 rollout/batch/port/nonce；本次 r1 不得复用或重放。
