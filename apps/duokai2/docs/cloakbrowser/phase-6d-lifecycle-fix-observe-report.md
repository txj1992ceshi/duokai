# Phase 6D：CloakBrowser 生命周期修复与真实 Observe 复演报告

- 日期：2026-07-28
- 工作区：`~/Documents/duokai-cloakbrowser-phase1-poc`
- 原始项目：`~/Documents/duokai`（本阶段未操作）
- Canary Profile：`试点 Profile`
- Profile ID：`<pilot-profile-id>`
- 目标引擎：CloakBrowser
- 目标 Chromium：`145.0.7632.109.2`
- Cloak 二进制 SHA256：`79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79`
- 最终决策：**Phase 6D Observe PASS；Enforce 仍为 NO-GO**

## 1. 范围与约束

本阶段只处理 Phase 6C 真实单 Profile Canary 暴露的两个生命周期阻断项：

1. trusted 验证成功附近会话自动关闭；
2. 浏览器进程退出后 SQLite 一度残留 `running`。

同时增加持续存活门禁和自动回归测试，并在修复后重新执行单 Profile `observe` 级真实复演。

全过程遵守以下边界：

- 只在隔离 worktree 中修改代码和生成证据；
- 不修改 `~/Documents/duokai`；
- 不执行 commit、merge、push 或发布；
- 不晋级 `enforce`；
- 真实启动只允许一个 Profile，最大并发为 1；
- 启动、停止和 Pilot 状态操作均通过 Duokai 产品链完成；
- CloakBrowser 二进制身份必须与固定 SHA256 一致；
- 发生异常时保持 fail-closed，并保留回滚备份及失败证据。

## 2. Phase 6C 根因复盘

Phase 6C 的表象是：trusted 成功后约 85 ms 会话自动关闭。原始 `runtime-audit.log` 证明真实触发链发生得更早：

| UTC 时间 | 事件 |
| --- | --- |
| `2026-07-28T09:34:24.969Z` | 出现 `write EPIPE`，堆栈来自 TLS/网络流 |
| `2026-07-28T09:34:24.970Z` | 全局错误分类器将其判为不可恢复异常，启动 process shutdown |
| `2026-07-28T09:34:25.059Z` | Cloak trusted 事务完成 |
| `2026-07-28T09:34:25.076Z` | rollout health 写入成功样本 |
| `2026-07-28T09:34:25.122Z` | 主窗口关闭 |
| `2026-07-28T09:34:25.164Z` | Cloak context 关闭 |

因此，“trusted 后自动关闭”只是时序表象；根因是网络 broken-pipe 被错误升级成进程级致命异常。

第二个问题来自调度竞态：`RuntimeScheduler` 在 `onStart()` 返回后无条件写入 `running`。当全局 shutdown 在启动事务中途开始时，context 尚未注册进 `runtimeContexts`，shutdown 清单无法停止它；事务随后返回，调度器仍可把数据库写为 `running`，进程随后退出，形成陈旧状态。

## 3. 修复内容

### 3.1 网络范围内的 EPIPE 容错

`networkErrorRecovery.ts` 新增受限 broken-pipe 分类：

- 只有 `EPIPE` 同时带有 TLS、fetch、undici、request 或代理通道等网络栈证据时，才按可恢复网络错误处理；
- 普通 stdout/IPC 管道断裂不自动降级；
- 命中文件系统、SQLite、Electron 核心等致命域时仍保持 fatal；
- 既有 `ECONNRESET` 等网络错误分类保持不变。

该规则避免再次因网络连接提前关闭而终止整个 Duokai 主进程，同时不把任意 `EPIPE` 一概吞掉。

### 3.2 持续存活门禁

新增 `cloakBrowserLiveness.ts`，在启动验证通过后、trusted 快照发布前执行持续存活采样：

- 默认最小持续时间：5 秒；
- 默认采样间隔：1 秒；
- 最少有效样本：3；
- 每次通过 CDP `Browser.getVersion` 验证真实浏览器进程仍响应；
- 记录页面数量与浏览器 product identity；
- 启动取消、context 消失、页面不存在或 CDP 失效时立即 fail-closed；
- 门禁未通过不得发布 trusted 快照或成功 health。

第一版探针曾使用页面 `evaluate`。真实复演发现，启动页导航和存储恢复会重建 JavaScript execution context，造成假阴性。该轮三次重试均被门禁阻断，没有发布 trusted。随后将探针改为 `Browser.getVersion`：页面导航不再影响存活判定，而浏览器/context 真正关闭仍会被严格拦截。

### 3.3 调度器真实活跃检查

`RuntimeScheduler` 增加 `isRunning(profileId)` 依赖：

- `onStart()` 返回后，只有 context 仍真实注册且未取消，才允许写 `running`；
- 启动期间被取消或返回时没有活跃 context，立即写回 `stopped`；
- 防止 shutdown 与启动事务交错时产生陈旧 `running`。

### 3.4 Context 关闭即时收敛

新增 `runtimeContextLifecycle.ts`，并在主进程关闭回调中使用：

- 只有当前注册的同一 context 关闭时才执行状态收敛；
- 旧 context 的延迟 close 事件不能误停替换后的新会话；
- 删除内存 context 后同步写本地 SQLite `stopped`；
- 随后再执行异步控制面同步、存储上传和锁释放；
- 对 fire-and-forget Promise 显式添加错误捕获，避免新的 `unhandledRejection`。

### 3.5 Shutdown 与启动事务排序

主进程 graceful shutdown 现在会：

1. 先取消 queued/starting Profile；
2. 等待在途启动收敛；
3. 再关闭已注册 context 和 Pilot session；
4. 同步写本地 `stopped`，之后再同步远端控制面。

启动事务同时把 `gracefulShutdownInFlight` 视为取消信号。context 与 Pilot session 会在记录 rollout 成功样本前完成注册，避免“成功 health 已写，但资源尚未进入 shutdown 可见集合”的窗口。

## 4. 自动验证

### 4.1 新增回归覆盖

新增或扩展以下测试：

- `networkErrorRecovery.test.ts`
  - TLS 网络栈 `write EPIPE` 可恢复；
  - stdout EPIPE 保持 fatal；
  - 文件系统域 EPIPE 保持 fatal；
  - 既有 `ECONNRESET` 行为不回归。
- `cloakBrowserLiveness.test.ts`
  - 多次 CDP 采样与最小持续时间；
  - 页面导航 execution-context 重建不造成假阴性；
  - `Browser.getVersion` 失效严格阻断；
  - 启动页不存在严格阻断。
- `runtimeContextLifecycle.test.ts`
  - 当前 context 关闭同步收敛到 stopped；
  - 旧 context close 不影响新 context。
- `runtimeScheduler.test.ts`
  - 活跃 context 才发布 running；
  - 无活跃 context 自动 stopped；
  - 在途启动取消后不能发布 running。
- `cloakBrowserProductionPilot.test.ts`
  - liveness 失败时回滚，并禁止 trusted 发布。

### 4.2 验证结果

- Cloak 全套测试：**142/142 通过**；
- TypeScript project build：通过；
- Phase 6D 变更文件定向 ESLint：通过；
- Vite renderer/main/preload build：通过；
- Electron Builder `--dir`：通过；
- `git diff --check`：通过。

全量 `npm run lint` 仍报告 17 条错误，全部位于本阶段未修改的既有 Phase 5/6 Cloak 文件中。Phase 6D 变更文件定向 lint 为零错误；这 17 条作为隔离分支基线债务保留，不作为本次回归。

重建包：

- App：`apps/duokai2/release/mac-arm64/Duokai.app`
- Electron：`41.0.2`
- 签名：ad-hoc
- `app.asar` SHA256：`5d7acb7e4e29cc3dca7c4bdaa582997ddcf93b87bf595a211bfbd07a28de6402`
- 未执行发布或公证。

## 5. 真实 Observe 复演

### 5.1 第一轮：门禁假阴性，安全阻断

第一轮正式 observe ID：

`phase6d-lifecycle-observe-20260728T104528Z`

页面 evaluate 版存活探针在导航期间连续三次检测到 execution context 消失。结果：

- 三次启动均未发布 trusted；
- health 只记录失败；
- Profile 自动退出 starting；
- 未留下运行锁或 Cloak 进程；
- 失败证据完整保留。

该结果证明门禁保持 fail-closed，但探针对象选择不正确。修正为 CDP 浏览器进程探测后，重新构建并创建全新、空 health 的第二轮 observe 窗口。

### 5.2 第二轮：真实成功

第二轮 rollout：

- Rollout ID：`phase6d-lifecycle-observe-r2-20260728T110320Z`
- Batch：`single-linkedin1-phase6d-r2`
- Profile：仅 `试点 Profile`
- 最大并发：1
- 初始 health：空
- 固定 Cloak SHA256：匹配

通过 preload 产品 API 调用：

`window.desktop.runtime.launch('<pilot-profile-id>')`

关键时间线：

| UTC 时间 | 事件 |
| --- | --- |
| `2026-07-28T11:09:56.096Z` | CDP 持续存活窗口开始 |
| `2026-07-28T11:10:01.674Z` | 存活窗口完成，持续 `5578 ms`，有效样本 `5` |
| `2026-07-28T11:10:06.728Z` | trusted 事务成功 |
| `2026-07-28T11:10:06.737Z` | rollout trusted outcome 写入 |
| `2026-07-28T11:10:06.740Z` | liveness 审计写入 |
| `2026-07-28T11:10:06.809Z` | Profile 正式进入 running |
| `2026-07-28T11:10:41.562Z` | 产品桥接复核仍为 running/trusted，队列与 starting 均空 |

trusted 后继续观察超过 60 秒。观察期间：

- 只有一个 Profile 运行；
- 没有自动关闭；
- 没有 `write EPIPE`；
- 没有非预期 `process_shutdown_begin`；
- 没有非预期 `main_window_close`；
- 没有 uncaught exception 或 unhandled rejection；
- health 保留 1 条 `trusted` 成功样本。

之后出现的 `process_shutdown_begin` 携带 `info: before-quit`，属于测试完成后的主动应用退出，不属于自动关闭。

## 6. Stop 与状态归零验证

通过产品 API 调用：

`window.desktop.runtime.stop('<pilot-profile-id>')`

不重启 Duokai，在同一 App 会话内立即复核：

- Profile：`stopped`；
- launch stage：`idle`；
- running IDs：空；
- queued IDs：空；
- starting IDs：空；
- runtime lock：unlocked；
- Pilot 状态：`stopped`。

同时只读检查正式数据：

- SQLite `试点 Profile`：`stopped`；
- SQLite `非目标 Profile`：`stopped`；
- `PRAGMA quick_check`：`ok`；
- `PRAGMA integrity_check`：`ok`；
- `.duokai-runtime-lock.json`：不存在；
- `production-transaction.json`：不存在；
- CloakBrowser 进程：不存在。

该结果直接验证了 Phase 6C 的陈旧 `running` 问题已修复：状态无需重启应用或人工补偿即可立即归零。

## 7. 最终 Fail-Closed 状态

复演结束后，正式控制面已恢复：

- Pilot enabled Profile：空；
- Rollout mode：`off`；
- Batch enabled：`false`；
- Batch kill switch：`true`；
- Global kill switch：`false`；
- 目标版本和固定 SHA256 保留；
- 第二轮 1 条 trusted health 证据保留，不用于自动晋级。

最终检查：

- 两个 Profile 均为 stopped；
- 数据库双重完整性检查通过；
- 无运行锁和未完成事务；
- 无测试 Duokai 主进程；
- 无 CloakBrowser 进程；
- 调试端口 `54262` 未监听；
- 成功运行期间无非预期 fatal action。

## 8. 结论

本阶段证据支持以下结论：

1. Phase 6C 的自动关闭根因已修复。真实 r2 observe 中，trusted 后稳定运行超过 60 秒，没有 EPIPE 全局 shutdown 或窗口自动关闭。
2. 陈旧 `running` 已修复。产品 `runtime.stop` 后，同一应用会话内 SQLite 和内存调度状态立即收敛到 stopped。
3. 持续存活门禁已生效。门禁失败时会阻止 trusted；修正探针后可用 CDP 真实浏览器进程证据通过。
4. 关闭回调、调度器和 graceful shutdown 已形成同一套 fail-closed 生命周期收敛逻辑。

因此：

- **Phase 6D Observe：PASS**
- **Enforce：NO-GO**

暂不允许晋级 enforce，原因是当前只有 1 条新的真实成功样本，仍未满足 rollout health policy 的最少 5 样本，也没有完成更长时间窗口和项目所有者显式确认。下一步应继续从单 Profile observe 累积独立成功启动，达到健康策略要求后再由项目所有者基于真实证据确认；不得直接切换 enforce。

## 9. 证据位置

成功 r2 证据：

`~/Documents/duokai-cloakbrowser-phase1-poc/.pilot-runtime/phase6d-lifecycle-r2-20260728T110320Z`

其中包括：

- `control-manifest.json`
- `launch.json`
- `status-01.json`
- `status-02.json`
- `stop-call.json`
- `status-after-stop.json`
- `failclosed-control.json`
- `final-state.json`

第一轮假阴性失败证据：

`~/Documents/duokai-cloakbrowser-phase1-poc/.pilot-runtime/phase6d-lifecycle-20260728T104528Z`

回滚备份：

`~/Documents/duokai-cloakbrowser-phase1-poc/.pilot-backups/phase6d-lifecycle-88f6db7a-20260728T104528Z`

## 10. Git 与发布边界

- 未 commit；
- 未 merge；
- 未 push；
- 未发布；
- 未公证；
- 未修改原始 `~/Documents/duokai` 工作区。
