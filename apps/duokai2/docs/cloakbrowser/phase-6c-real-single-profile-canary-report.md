# Phase 6C：真实单 Profile CloakBrowser Canary 审计报告

- 日期：2026-07-28
- 工作区：`~/Documents/duokai-cloakbrowser-phase1-poc`
- 分支：`codex/cloakbrowser-phase1-poc`
- Task Graph：`task_c0714337-83da-4cb3-a81a-1fbefbd21d9b`
- 结论：**NO-GO，禁止晋级 `enforce`，禁止扩大批次**

## 1. 本阶段范围

本阶段在用户明确授权后，执行一次真实的、受控的单 Profile CloakBrowser canary。允许的动作包括：

1. 只选择一个合格的真实 Profile；
2. 为正式 Duokai 用户数据目录创建 Pilot 与 rollout 控制文件；
3. 通过打包后的 Duokai 产品桥接调用正式 `runtime.launch`；
4. 启动固定身份的 CloakBrowser；
5. 采集启动、网络、指纹、可信快照、健康样本和生命周期证据；
6. 结束 canary 后停止 Profile、禁用 Pilot，并把 rollout 切回 fail-closed 状态。

本阶段没有执行 `commit`、`merge` 或 `push`，也没有修改原始项目目录 `~/Documents/duokai`。

## 2. Canary 对象与固定运行时身份

唯一候选 Profile：

- 名称：`试点 Profile`
- Profile ID：`<pilot-profile-id>`
- 正式数据库：`~/Library/Application Support/duokai2-desktop/bitbrowser-clone.sqlite`
- 正式工作区：`~/Library/Application Support/duokai2-desktop/workspaces/<pilot-profile-id>`

固定 CloakBrowser 身份：

- 可执行文件：`~/.cloakbrowser/chromium-145.0.7632.109.2/Chromium.app/Contents/MacOS/Chromium`
- 请求版本：`145.0.7632.109.2`
- 实际 Chromium 版本：`145.0.7632.109`
- SHA256：`79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79`
- Wrapper：`@cloaka13/playwright-patch@1.58.2`

启动前已重新核验二进制哈希，不接受路径相同但内容不同的可执行文件。

## 3. 启动前门禁

正式写入和启动前确认：

- SQLite `PRAGMA quick_check`：`ok`
- SQLite `PRAGMA integrity_check`：`ok`
- `试点 Profile` 状态：`stopped`
- 另一个 Profile `非目标 Profile` 状态：`stopped`
- 正式 Profile 运行锁：不存在
- CloakBrowser 进程：不存在
- 测试 worktree Duokai 进程：不存在
- 正式 Pilot、rollout、health 控制文件：初始均不存在
- 二进制路径、版本与 SHA256：精确匹配

### 3.1 并发冲突处理

预检期间发现用户原先已打开 `/Applications/Duokai.app`，它与测试构建使用同一个正式用户数据目录。门禁在任何 Profile 启动前阻止继续：

- 没有触发 `runtime.launch`；
- 两个 Profile 仍为 `stopped`；
- health 窗口仍为空；
- 没有 CloakBrowser 进程。

之后仅结束本次任务启动的重复测试进程；在确认无 Profile 运行后，再以精确主进程路径正常退出旧版 Duokai UI，使真实 canary 期间只有一个 Duokai 主进程访问正式数据目录。canary 完成后，原 `/Applications/Duokai.app` 已重新打开。

## 4. 可验证回滚基线

真实写入前创建独立回滚备份：

`~/Documents/duokai-cloakbrowser-phase1-poc/.pilot-backups/phase6c-real-canary-88f6db7a-20260728T091528Z`

验证结果：

- 使用 SQLite backup API 生成一致性数据库备份；
- 备份数据库 `quick_check` 与 `integrity_check` 均为 `ok`；
- 备份数据库 SHA256：`93416c3fab272f3b3276cf0b25ea437bbd159a788da7899feaeb962fb006490c`；
- Profile 工作区共 257 个文件，约 12.88 MiB；
- 源与备份逐文件 SHA256、权限和相对路径一致；
- 备份过程中再次核对正式源，未发现漂移；
- 备份目录权限为 `0700`，数据库与清单权限为 `0600`。

本次 canary 最终不需要用备份覆盖正式数据；通过产品停止链和控制面回滚已恢复安全状态。备份继续保留作审计和必要时人工恢复使用。

## 5. 正式控制面

初始正式 rollout：

- rollout ID：`phase6c-real-observe-20260728T092126531Z`
- batch ID：`single-linkedin1`
- mode：`observe`
- Profile 数量：1
- `maxConcurrentSessions`：1
- global kill switch：关闭
- batch kill switch：关闭
- 固定浏览器版本与二进制 SHA256：已绑定

控制哈希：

- Pilot config：`16c47caa0f0ee788cffaf77c051ca702582ee05afb65adbc075e136d87139ead`
- Rollout control：`8d88f5f36aa6c9b6b44170a777ce75d07f15d1768442680bb3b084338ff45afd`
- 初始 health state：`ba6390534fdf0e8739adf944b03d82a0d5d513329072fb09202a6aba5eff39db`
- Observe readiness report：`5800b70afff25582c298f0654ae208e4607346b9f5ff0d399ac1b6b82ebfd5ef`

Observe readiness 全部通过。该 readiness 只授权采集真实 observe 样本，不构成 `enforce` 授权。

## 6. 真实启动时间线（UTC）

1. `2026-07-28T09:32:34.282Z`：通过打包 Duokai 的 preload 桥接调用 `window.desktop.runtime.launch(profileId)`。
2. `2026-07-28T09:32:34.295Z`：产品返回已进入 `starting`，没有发起第二次启动。
3. 启动过程中真实 CloakBrowser 145 进程出现，其 `--user-data-dir` 指向唯一正式 Profile 目录。
4. `2026-07-28T09:34:25.079Z`：产品日志记录启动门禁已在 `trusted` 级别通过。
5. `2026-07-28T09:34:25.155Z`：rollout health 写入一条 `success=true`、`reason=trusted` 的成功样本。
6. `2026-07-28T09:34:25.164Z`：产品日志记录 Cloak Pilot 已关闭。

从“可信启动成功”到“会话关闭”约 **85 ms**。

## 7. 已通过的真实验证

可信快照和运行证据支持以下结论：

- 引擎为 `cloakbrowser`；
- 请求版本与实际 Chromium 版本符合固定身份要求；
- 实际二进制 SHA256 与控制面完全一致；
- Wrapper 版本已记录；
- 旧的完整 JS 指纹注入路径未启用；
- 网络路由检查通过；
- 启动导航检查通过；
- 凭据脱敏检查通过；
- 权限契约检查通过；
- 时区、语言、地理位置、设备与原生指纹配置进入可信快照；
- 快照状态为 `trusted`，验证级别为 `full`；
- 快照使用 `HMAC-SHA256` 签名，签名密钥材料未写入本报告；
- 正式 rollout health 留存一条 trusted 成功样本。

代理地址、认证信息、出口 IP 和具体地理数据在本报告中保持脱敏。

## 8. 阻断缺陷

尽管可信启动和各项门禁通过，本次 canary **不能视为可持续运行成功**。

### 8.1 会话在成功后立即自动关闭

CloakBrowser 在记录 trusted 成功后约 85 ms 自动关闭。没有获得最小持续会话时间、交互稳定性或长时间健康证据。

这意味着“一条 trusted 启动样本”只能证明启动门禁和初始身份验证成功，不能证明生产会话生命周期健康。

### 8.2 数据库一度残留陈旧 `running` 状态

浏览器会话和测试 Duokai 主进程已经退出后，正式数据库仍一度把 `试点 Profile` 标记为 `running`。只有重新打开同一测试构建并通过产品桥接执行 `runtime.stop(profileId)` 后，状态才恢复为 `stopped`。

这暴露了进程异常退出或上下文快速关闭时，Profile 状态与真实进程状态不能确定性收敛的问题。

### 8.3 调试目标在启动期间失效

真实启动过程中 Electron 调试页面被重建或主进程退出，原 CDP WebSocket 目标失效。因此最终状态不依赖单一 CDP 结果，而是通过以下来源交叉确认：

- 正式 SQLite 状态；
- CloakBrowser 进程表；
- 正式运行锁与生产事务文件；
- rollout health；
- 可信身份文件；
- 产品 runtime logs。

## 9. 安全停止与回滚结果

发现生命周期异常后执行：

1. 重新打开同一测试构建；
2. 通过正式产品桥接执行 `runtime.stop(试点 Profile)`；
3. 确认 Profile 为 `stopped`，运行、排队和启动集合全空；
4. 通过产品桥接禁用该 Profile 的 Pilot 资格；
5. 原子更新 rollout：`mode=off`；
6. 将批次设为 `enabled=false`、`killSwitch=true`；
7. 保留 trusted health 样本和可信快照，不伪造或清空证据；
8. 退出测试构建并清理仅属于其精确路径的孤立 Helper；
9. 重新打开原 `/Applications/Duokai.app` 恢复用户桌面环境。

最终 rollout control hash：

`ea0d0a9a07a3a83fffa098eef587a17e44a307c484616474fac90fba40df99c7`

## 10. 最终安全状态

最终复核结果：

- SQLite `quick_check`：`ok`
- SQLite `integrity_check`：`ok`
- `试点 Profile`：`stopped`
- `非目标 Profile`：`stopped`
- Pilot enabled Profile IDs：空数组
- rollout mode：`off`
- canary batch：`enabled=false`
- canary batch kill switch：`true`
- 正式 health 样本：1 条 trusted 成功证据，保持只读审计价值
- Profile runtime lock：不存在
- 未完成 production transaction：不存在
- trusted identity：存在，权限 `0600`
- CloakBrowser 进程：不存在
- 测试 worktree Duokai 进程：不存在
- 原 `/Applications/Duokai.app`：已恢复打开，且没有自动启动任何 Profile

正式控制文件和签名密钥文件权限均为 `0600`。

## 11. 晋级决策

### 决策：NO-GO

不得执行以下动作：

- 不得把 rollout 切到 `enforce`；
- 不得增加第二个 Profile；
- 不得扩大批次或并发；
- 不得把单条 trusted 健康样本当作生产稳定性证明；
- 不得删除旧 Chromium 路径或宣布最终单引擎发行完成。

再次进行真实 canary 前必须至少完成：

1. 定位并修复 trusted 启动后约 85 ms 自动关闭的根因；
2. 为上下文快速关闭、Electron 主进程退出和异常恢复补充确定性的状态回写；
3. 确保进程真实退出后数据库不会残留 `running`；
4. 增加持续会话门禁，例如最小存活时长、页面可用性和多次采样；
5. 增加针对“成功后立即关闭”和“陈旧 running”的自动化回归测试；
6. 修复完成后重新从单 Profile `observe` 开始，不复用本次样本直接晋级。

## 12. 审计证据

本次运行证据目录：

`~/Documents/duokai-cloakbrowser-phase1-poc/.pilot-runtime/phase6c-real-20260728T092126531Z`

关键文件包括：

- `control-manifest.json`
- `observe-readiness.json`
- `prelaunch-process-conflict.json`
- `devtools-targets.json`
- `bridge-prelaunch.json`
- `runtime-launch-result.json`
- `startup-cross-check.json`
- `runtime-stop-and-disable.json`
- `rollout-disabled.json`
- `final-safe-state-before-restore.json`
- `restored-installed-app-state.json`

回滚备份：

`~/Documents/duokai-cloakbrowser-phase1-poc/.pilot-backups/phase6c-real-canary-88f6db7a-20260728T091528Z`

本报告的核心结论是：**CloakBrowser 的真实启动、固定身份、网络和可信快照链已经通过一次生产数据 canary；但会话生命周期和状态收敛存在阻断性缺陷，当前只能保持 rollout off，不能晋级。**
