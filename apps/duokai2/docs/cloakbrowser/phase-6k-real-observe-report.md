# Phase 6K：硬化包真实单 Profile Observe 复验报告

## 1. 结论

- **Electron/CDP 一次性启动通道：GO**
- **Phase 6K 真实单 Profile Observe：NO-GO**
- **Enforce：NO-GO**
- **生产签名、notarization 与发布：NO-GO**

本阶段成功证明 Phase 6J 的一次性请求、精确 PID、精确 `app.asar`、业务身份绑定和 CDP readiness 回执可以在真实打包 App 中闭环工作；但目标 Profile「试点 Profile」未达到 trusted，未进入 60 秒 / 13 样本 post-trust 门禁，因此不能形成 Observe 成功样本。

真实失败发生在 `startup-verification`：LinkedIn 启动导航被 `chrome-error://chromewebdata/` 导航替换，随后 `page.evaluate` 遇到 execution context destruction。RuntimeScheduler 的内部重试又两次在代理预检阶段收到 CONNECT `502`。系统全程 fail-closed，没有错误发布 trust，也没有 false-green 成功结果。

## 2. 授权与边界

用户明确授权：

- 使用 Phase 6J 硬化包打开真实 Duokai App；
- 只启动 Profile「试点 Profile」；
- Observe 模式；
- `maxConcurrentSessions = 1`；
- 不进入 Enforce；
- 完成后显式停止 Profile/App，并恢复全部控制为 fail-closed。

本阶段没有：

- 启动「非目标 Profile」或任何其他 Profile；
- 进入 Enforce；
- commit、merge、push、publish；
- 修改正式仓库 `~/Documents/duokai`；
- notarize 或分发构建产物。

Task Graph：

```text
task_63e6b60a-9309-4a35-b8ae-163f4b93fae1
```

工作区：

```text
~/Documents/duokai-cloakbrowser-phase1-poc
```

## 3. 目标身份

目标 Profile：

```text
name: 试点 Profile
id:   <pilot-profile-id>
```

非目标 Profile：

```text
name: 非目标 Profile
id:   <non-target-profile-id>
result: 未启动，终态 stopped
```

CloakBrowser：

```text
version: 145.0.7632.109.2
binary SHA256: 79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79
```

## 4. Phase 6K 中发现并修复的打包读取问题

### 4.1 R1：在 Profile 启动前安全拒绝

第一份一次性请求绑定 Phase 6J 构建：

```text
rollout: phase6k-cdp-observe-20260728T171004Z
port: 55321
app.asar SHA256: 61a169d0179b7474460998b16fa0887537414321b547fd43cf034eb89869449d
```

App 读取请求时，在 Profile 启动前拒绝：

```text
ENOENT, not found in .../Contents/Resources/app.asar
```

原因不是请求身份不匹配，而是 Electron patched `fs` 将 `app.asar` 暴露为虚拟归档目录，无法按普通物理文件方式读取归档原始字节并计算 SHA256。

R1 没有调用产品 `runtime.launch`，没有启动 Profile，控制自动恢复为 fail-closed。

证据：

```text
.pilot-runtime/phase6k-observe-20260728T171004Z/r1-rejected-receipt.json
SHA256: 13090790ccd389b12341ed0b15f5baf65e723d2c2da0f5217629b25ddb3fec4c
```

### 4.2 离线修复

修复内容：

1. `cloakBrowserElectronCdpLaunch.ts`
   - 支持注入物理 `app.asar` 文件读取器；
   - 哈希逻辑仍绑定完整原始归档字节。
2. `electron/main.ts`
   - 打包主进程使用 `node:original-fs` 的 `readFileSync`；
   - 在 `app.whenReady()` 前将其传给一次性请求校验器。
3. `vite.config.ts`
   - 将 `node:original-fs` 显式列为 Electron 主进程 external；
   - 防止 Vite 将其替换为空的浏览器兼容模块。
4. 聚焦测试
   - 验证精确物理归档读取路径；
   - 验证主进程使用 `node:original-fs`；
   - 验证 Vite external 门禁。

首次重建曾暴露 Vite 将 `node:original-fs` 替换为空模块的问题。该构建虽然退出码为 0，但被产物静态审计拒绝，没有用于真实 Profile 启动。补充 external 后再次构建，编译产物保留真实：

```js
import ... from "node:original-fs"
```

修复后验证：

| 验证项 | 结果 |
|---|---:|
| Electron/CDP 聚焦测试 | 8/8 PASS |
| 全量 Cloak 测试 | 161/161 PASS |
| TypeScript | PASS |
| 目标 ESLint | PASS |
| `git diff --check` | PASS |
| `npm run build:dir` | PASS |
| strict codesign verification | PASS |

### 4.3 R2：过期请求安全拒绝

修复包的第二份请求：

```text
rollout: phase6k-cdp-observe-r2-20260728T171004Z
port: 55322
app.asar SHA256: 9872af71a676c2110ffc12cdf831e29b2336b677a51e65598dd6e019b49385b5
```

App 实际消费时已超过 120 秒 TTL 约 1 秒，因此正确拒绝：

```text
Electron CDP launch request has expired.
```

R2 同样没有启动 Profile，控制自动恢复为 fail-closed。

证据：

```text
.pilot-runtime/phase6k-observe-20260728T171004Z/attempt-r2/rejected-receipt.json
SHA256: 0e632c3a055e678b6b2216c48ce30aad785b9490621eea4f65fd484caac775df
```

## 5. R3：PID/CDP 一次性通道真实闭环

R3 使用全新 rollout、batch、端口和 nonce：

```text
rollout: phase6k-cdp-observe-r3-20260728T171004Z
batch: single-linkedin1-phase6k-r3
port: 55323
nonce: 557a5f15-d672-433a-8cd3-acf268880e15
request SHA256: e0564ef05cd4e75b5dcc9a5d69e51d74170d012290a6628f5fe9466dc8aeed2f
```

App 回执：

```text
status: ready
PID: 60696
receipt mode: 0600
parent directory mode: 0700
process executable: exact match
resources path: exact match
app.asar SHA256: exact match
rollout / batch / Profile: exact match
CDP bind: 127.0.0.1:55323
readiness attempts: 1
readiness duration: 65 ms
```

Electron App shell CDP identity：

```text
Chrome/146.0.7680.72
ws://127.0.0.1:55323/devtools/browser/b93e0211-1595-48b6-bec3-9e0694d3701a
```

说明：这里的 CDP 是 Duokai Electron App shell 的控制通道，不是 Profile 使用的 CloakBrowser 版本身份。Profile CloakBrowser 仍固定为 `145.0.7632.109.2`。

执行器再次读取 `/json/version`，确认实时 endpoint 与 App 回执一致；一次性请求文件已被消费，PID `60696` 当时存活。

结论：**Phase 6J/6K Electron PID/CDP 启动通道真实验证通过。**

证据：

```text
.pilot-runtime/phase6k-observe-20260728T171004Z/attempt-r3/electron-cdp-ready-receipt.json
SHA256: 38e741485b00ec56265bf547bcd2fb5678c5e4f5e1887d77630c3378b6192b1d
```

## 6. R3 真实 Profile Observe 时间线

产品 `runtime.launch` API 调用次数：**1**。

RuntimeScheduler 在该调用内部按现有设置进行了两次自动重试；这些不是额外的人工或执行器重试。

关键时间线：

| UTC 时间 | 阶段 |
|---|---|
| 17:32:25.006 | Profile 入队，runtime lock 获取，Observe admission 通过 |
| 17:32:27.462 | runtime host ready |
| 17:32:58.042 | delivery-preflight |
| 17:32:58.207 | network-verification |
| 17:32:58.214 | transport-acquisition |
| 17:32:58.224 | browser-launch |
| 17:32:59.889 | runtime-verification |
| 17:32:59.900 | startup-verification |
| 17:33:26.419 | LinkedIn 导航被 `chrome-error://chromewebdata/` 导航替换 |
| 17:33:27.938 | rolling-back |
| 17:33:28.106 | rolled-back |
| 17:33:28.116 | failed |
| 17:33:28.146 | 写入一个 rollout failure outcome |
| 17:33:33.169 | Scheduler 内部重试：代理 CONNECT 502 |
| 17:33:38.210 | Scheduler 内部重试：代理 CONNECT 502 |
| 17:33:38.215 | Profile 最终 `start_profile_err` |
| 17:33:38.501 | 执行器记录 fail-closed 失败 |
| 17:33:38.718 | App 关闭请求完成，PID 已退出 |

## 7. 失败分类

### 7.1 首要失败：启动验证导航竞态

第一次事务已完成 delivery、network、transport、browser launch 和 runtime identity 验证，进入 `startup-verification`。

首次导航错误：

```text
page.goto: Navigation to "https://www.linkedin.com/" is interrupted by another navigation to "chrome-error://chromewebdata/"
```

随后 startup verification 失败：

```text
Cloak production transaction failed during startup-verification:
page.evaluate: Execution context was destroyed, most likely because of a navigation
```

事务按设计在 trust publication 前回滚：

```text
startup-verification
→ rolling-back
→ rolled-back
→ failed
```

因此：

- 没有发布新的 trusted snapshot；
- 没有到达 post-trust gate；
- 没有生成 60 秒 / 13 样本；
- 没有成功 health outcome；
- 没有 false-green。

### 7.2 Scheduler 内部重试：代理 CONNECT 502

第一次事务回滚后，RuntimeScheduler 依据当前配置自动重试两次。两次均在代理预检阶段失败：

```text
proxy: https://<proxy-host>:7085
DNS: success
TCP connect: success
local proxy bridge: success
HTTP CONNECT tunnel: 502
latency: approximately 5004–5005 ms
```

最终错误：

```text
Proxy preflight failed for "试点 Profile": Proxy CONNECT failed with status 502
```

这表明代理路径在 DNS/TCP/bridge 层可达，但上游 CONNECT 隧道未建立。该结果不能被分类为 CloakBrowser 运行时成功。

## 8. Health 与 false-green 审计

最终 health 仅包含一个失败 outcome：

```text
success: false
reason: Cloak production transaction failed during startup-verification:
        page.evaluate: Execution context was destroyed, most likely because of a navigation
```

审计结果：

```text
trusted reached: false
post-trust gate reached: false
post-trust samples: 0
success outcomes: 0
failure outcomes: 1
fatal matches: []
false-green: false
```

## 9. 终态与清理

最终控制：

```text
Pilot enabledProfileIds: []
rollout mode: off
globalKillSwitch: true
batch enabled: false
batch killSwitch: true
maxConcurrentSessions: 1
```

进程与端口：

```text
Duokai App: not running
CloakBrowser: not running
127.0.0.1:55323: no listener
one-time request file: absent / consumed
Electron PID 60696: exited
```

Profile 终态：

```text
试点 Profile: stopped
非目标 Profile: stopped
```

数据与锁：

```text
active target sync tasks: 0
live database WAL/SHM sidecars: 0
runtime lock / transaction files: 0
bitbrowser-clone.sqlite quick_check: ok
bitbrowser-clone.sqlite integrity_check: ok
desktop.db quick_check: ok
desktop.db integrity_check: ok
```

说明：证据采集期间，`sqlite3` 查询曾生成空闲 WAL/SHM sidecar；在确认 App 与 CloakBrowser 均已关闭后完成 checkpoint，并删除本次查询产生的 sidecar，重新生成终态证据。

终态证据：

```text
.pilot-runtime/phase6k-observe-20260728T171004Z/attempt-r3/terminal-state.json
SHA256: 7b95d1d65d87e5b509b905c03b85a8404deaea4efc1d228535b3d904f4da140c
```

数据库检查：

```text
.pilot-runtime/phase6k-observe-20260728T171004Z/attempt-r3/database-checks.json
SHA256: 8c5a0b6faa8572e274944940a3d4d3fac785a12170e48614826fb62e198b618d
```

## 10. 单引擎包审计

当前 `app.asar`：

```text
~/Documents/duokai-cloakbrowser-phase1-poc/apps/duokai2/release/mac-arm64/Duokai.app/Contents/Resources/app.asar
SHA256: 9872af71a676c2110ffc12cdf831e29b2336b677a51e65598dd6e019b49385b5
```

ASAR 审计：

| 项目 | 结果 |
|---|---:|
| total entries | 6542 |
| `cloakbrowser` | 0.5.2 / 73 entries |
| `playwright-core` | 1.58.2 / 397 entries |
| ordinary `playwright` dependency | 0 |
| ordinary `playwright` entries | 0 |
| `ms-playwright` | 0 |
| Chromium 1208 | 0 |
| embedded Cloak binary | 0 |
| `node:original-fs` marker | present |
| `resolveChromiumExecutable` | absent |
| `buildFingerprintInitScript` | absent |

单引擎静态测试：**3/3 PASS**。

说明：Electron App shell 自身仍包含 Electron Framework 的 Chromium，用于桌面 UI 渲染。“单引擎”指 Profile/browser runtime 不包含普通 Playwright-managed Chromium payload 或 fallback。

ASAR 审计证据：

```text
.pilot-runtime/phase6k-observe-20260728T171004Z/attempt-r3/asar-audit.json
SHA256: 8fa51f04bb42e32873f3f40b4496362a9bd0036f040380686f58c56c3589c32f
```

## 11. 验证汇总

```text
Electron/CDP focused tests: 8/8 PASS
Full Cloak tests:           161/161 PASS
Single-engine tests:        3/3 PASS
TypeScript:                 PASS
Target ESLint:              PASS
git diff --check:           PASS
build:dir:                  PASS
strict codesign:            PASS
ASAR audit:                 PASS
DB quick/integrity checks:  PASS
```

构建仅为本地 ad-hoc signed directory package：

```text
notarized: false
published: false
```

## 12. 最终证据

结构化最终证据：

```text
.pilot-runtime/phase6k-observe-20260728T171004Z/final-evidence.json
SHA256: 4eba5c98a4ce32e3df0a874ceb63d9eedb7d47f1508565dabc4e2b6c136610a7
```

失败原始证据：

```text
.pilot-runtime/phase6k-observe-20260728T171004Z/attempt-r3/failure.json
SHA256: c390ff720fa04c4a5768fd5bc6ffb08d4207cc4a6e53a4d10d39ec4dabe4574a
```

验证摘要：

```text
.pilot-runtime/phase6k-observe-20260728T171004Z/attempt-r3/verification-summary.json
SHA256: 9cf5e0ac2e9e76cad859da6b9c0961890fad6f08a12be603fd473dddff4a9e89
```

文件哈希清单：

```text
.pilot-runtime/phase6k-observe-20260728T171004Z/attempt-r3/artifact-hashes.json
SHA256: 8fb302b8cff6b73328525ec82214236c2e0eb6f21e8a51e4e8efdb08981df6e8
```

## 13. 决策理由

### Electron/CDP 启动通道 GO

因为 R3 已真实证明：

- 短时一次性请求可被原子消费；
- 请求权限、父目录权限符合门禁；
- 精确 PID、可执行路径、资源路径、ASAR 哈希、rollout、batch、Profile 全部绑定；
- App 自检 CDP readiness；
- 外部执行器复核实时 endpoint；
- 请求不可复用；
- 失败与关闭路径恢复 fail-closed。

### Phase 6K Observe NO-GO

因为：

1. Profile 未达到 trusted；
2. startup verification 因导航竞态失败；
3. 内部重试又遇到代理 CONNECT 502；
4. 没有 60 秒 / 13 样本 post-trust 证据；
5. 没有新的 Observe 成功样本。

### Enforce NO-GO

除本次失败外，治理门槛仍要求足够的新鲜成功样本、零 false-green、生产签名/notarization 与发布验收。当前不满足。

## 14. 下一门禁

建议下一阶段为纯离线：

### Phase 6L：启动验证导航竞态与代理 502 分类离线硬化

范围：

1. 在不把 `chrome-error://chromewebdata/` 当成成功的前提下，正确处理 document replacement / execution-context churn；
2. 避免在正在切换的 document 上直接执行 startup `page.evaluate`；
3. 为 LinkedIn 式导航竞争、`chrome-error` 重定向和 context destruction 添加确定性测试；
4. 将代理 CONNECT `502` 与 DNS、TCP、bridge 错误分层分类；
5. 明确单 Profile canary 下 RuntimeScheduler 内部重试的审计和 outcome 语义。

Phase 6L 不应启动真实 App 或 Profile。完成后如需再次真实 Observe，应建立新 Task Graph，并取得新的明确授权。
