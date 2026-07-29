# Phase 6J — Electron/CDP 启动通道离线修复报告

## 1. 结论

- **Phase 6J：GO（仅限离线实现与发行包审计）**
- **真实单 Profile Observe：尚未执行**
- **Enforce：NO-GO**
- **正式发布：NO-GO**

Phase 6I 中，Phase 6H 硬化目录包的 Electron 主进程已经出现，但结构化 `.app` 打开通道没有形成可用 CDP 监听，导致产品 API 客户端无法连接；执行器因此没有进入 `observe`，也没有调用 `runtime.launch` 或启动 Profile。

Phase 6J 不对该失败做未经证据支持的单一归因，而是消除对外部 `.app` 打开工具传递 Electron 命令行参数的依赖。修复后的打包 App 使用一个短时、一次性、私有且绑定精确构建身份的本地启动请求，在 `app.whenReady()` 之前自行配置 CDP，并在启动后自行验证 `/json/version`。任何请求、端口或后续 bootstrap 异常都恢复 Cloak rollout fail-closed 并退出。

本阶段没有打开真实 App，没有启动 CloakBrowser 或任何 Profile，没有修改正式 rollout controls，也不构成 Phase 6K 或 Enforce 授权。

## 2. 执行边界

工作区：

```text
~/Documents/duokai-cloakbrowser-phase1-poc
```

Task Graph：

```text
task_1a98680e-6868-45db-85f3-6f8f696ce537
```

约束：

- 仅执行源码、测试、构建和 ASAR 静态审计；
- 不调用 `localAppOpen`；
- 不调用产品 `runtime.launch`；
- 不调用 CloakBrowser `launchPersistentContext`；
- 不启动任何真实 Profile；
- 不修改正式数据库和正式控制文件；
- 不进入 `enforce`；
- 不 commit、merge、push、签发或发布；
- 不修改正式仓库 `~/Documents/duokai`。

## 3. 一次性 CDP 启动请求

新增：

```text
apps/duokai2/electron/services/cloakBrowserElectronCdpLaunch.ts
```

请求路径：

```text
<Electron userData>/cloak-pilot/electron-cdp-launch-request.json
```

请求仅允许：

```text
schemaVersion = 1
purpose = single-profile-observe
failClosedOnFailure = true
debuggingAddress = 127.0.0.1
```

同时必须满足：

1. 请求文件在非 Windows 平台权限为 `0600`；
2. 父目录权限为 `0700`；
3. 请求具备一次性 nonce；
4. 创建和过期时间有效；
5. 最大 TTL 为 `120000 ms`；
6. CDP 端口位于 `49152–65535`；
7. readiness timeout 位于 `5000–60000 ms`；
8. `expectedExecutablePath` 精确等于当前 `process.execPath`；
9. `expectedAppAsarSha256` 精确等于当前打包 `app.asar`；
10. rollout、batch 和 Profile 均使用非通配的具体 ID；
11. 仅允许 packaged App 使用该请求。

不存在请求时，App 不追加任何 CDP switch，普通启动行为不开放调试端口。

## 4. 原子消费和 PID 回执

App 在读取请求前先把请求原子重命名为进程专属 consuming 文件，防止多个进程重复消费。有效请求完成以下动作：

1. 校验私有权限、时效、用途和字段；
2. 读取并计算真实 `app.asar` SHA256；
3. 绑定当前可执行路径；
4. 在 `app.whenReady()` 前追加：

```text
--remote-debugging-address=127.0.0.1
--remote-debugging-port=<approved ephemeral port>
```

5. 写入 `configured` 回执；
6. 回执记录精确 PID、可执行路径、Resources 路径、ASAR SHA、端口、rollout、batch 和 Profile；
7. 请求被删除，不能被下次启动复用。

请求和回执采用临时文件、`0600` 权限、`fsync` 和 rename 的原子写入方式。

回执状态包括：

```text
configured
ready
failed
rejected
```

## 5. App 自验证的 CDP readiness

主进程启动顺序现为：

```text
读取并消费一次性请求
    ↓
校验 executable + app.asar SHA
    ↓
在 app.whenReady 前配置 loopback CDP
    ↓
app.whenReady
    ↓
初始化产品服务和窗口
    ↓
轮询 http://127.0.0.1:<port>/json/version
    ↓
验证 Browser identity 与 webSocketDebuggerUrl
    ↓
写入 ready 回执
```

readiness 探针是有界的，不会无限等待。只有 `/json/version` 返回浏览器身份和 `ws://` WebSocket URL 后，回执才会进入 `ready`。

这使后续 Phase 6K 执行器可以同时核对：

- 目标 App 构建身份；
- 请求 nonce；
- 主进程精确 PID；
- 监听地址和端口；
- Electron CDP 浏览器身份；
- App 自己确认的 ready 状态。

## 6. Fail-closed 失败处理

### 6.1 请求被拒绝

无效、过期、权限不安全、路径不匹配或 ASAR 漂移时：

- 不追加 CDP switch；
- 写入 `rejected` 回执；
- 清空 Pilot Profile allowlist；
- rollout 设为 `off`；
- global kill switch 设为 `true`；
- 所有 batch 设为 disabled；
- 所有 batch kill switch 设为 `true`；
- 保留已有 health outcomes；
- App 使用退出码 `72` 结束。

### 6.2 CDP 未就绪

窗口创建后 CDP 在限定时间内未就绪时：

- 写入 `failed` 回执；
- 记录 readiness 尝试次数、持续时间和最后错误；
- 恢复同样的 fail-closed controls；
- App 使用退出码 `73` 结束。

### 6.3 配置 CDP 后 bootstrap 失败

CDP 已配置，但数据库、IPC、窗口或其他后续 bootstrap 步骤抛错时：

- 写入 `failed` 回执；
- 恢复 fail-closed controls；
- 执行 graceful shutdown；
- App 使用退出码 `74` 结束。

因此，Phase 6I 中“主进程隐藏存在但端口未建立、外部状态误判”的场景不再依赖 `.app` 路径布尔状态判断；后续以一次性请求、精确 PID 回执和 CDP endpoint 三方证据判定。

## 7. 测试覆盖

新增：

```text
apps/duokai2/electron/services/cloakBrowserElectronCdpLaunch.test.ts
```

聚焦测试覆盖：

1. 无请求时不启用 CDP；
2. 有效私有请求被消费并记录 PID；
3. 可执行路径不匹配时拒绝；
4. 过期或权限不安全请求被拒绝并删除；
5. readiness 可容忍短时连接失败后成功；
6. readiness 超时返回有界失败；
7. 失败时恢复 fail-closed 且不抹除 health；
8. 主进程在 `app.whenReady` 前消费请求，并覆盖请求拒绝、端口失败和后续 bootstrap 失败三类收口路径。

最终结果：

```text
Focused Electron/CDP tests: 8/8 PASS
Combined Cloak tests:       161/161 PASS
TypeScript:                  PASS
Targeted ESLint:             PASS
git diff --check:            PASS
```

## 8. 构建和签名验证

执行：

```text
npm run build:dir
```

结果：

- TypeScript project build：PASS；
- Vite renderer build：PASS；
- Electron main build：PASS；
- Electron preload build：PASS；
- electron-builder macOS arm64 directory package：PASS；
- ad-hoc codesign 深度严格验证：PASS；
- Apple notarization：未执行；
- App 未被打开。

产物：

```text
~/Documents/duokai-cloakbrowser-phase1-poc/apps/duokai2/release/mac-arm64/Duokai.app
```

`app.asar` SHA256：

```text
61a169d0179b7474460998b16fa0887537414321b547fd43cf034eb89869449d
```

## 9. ASAR 单引擎与启动通道审计

ASAR 总条目：

```text
6542
```

依赖和资源：

```text
cloakbrowser:             0.5.2
playwright-core:          1.58.2
ordinary playwright:      absent
cloakbrowser entries:     73
playwright-core entries:  397
ordinary playwright:      0
ms-playwright:             0
chromium-1208:             0
embedded Cloak binary:     0
```

编译主进程中存在：

```text
electron-cdp-launch-request.json
remote-debugging-address
remote-debugging-port
electron_cdp_launch_request_rejected
electron_cdp_launch_readiness_failed
electron_cdp_launch_ready
electron_cdp_launch_bootstrap_failed_closed
single-profile-observe
127.0.0.1
```

编译主进程中不存在：

```text
resolveChromiumExecutable
buildFingerprintInitScript
```

ASAR 审计结果：`success=true`，失败项为空。

## 10. 文件身份

```text
4b5c8ce100369665f3b4ce5f24d405eba405b5e03630385513b0a404b294e04c  apps/duokai2/electron/services/cloakBrowserElectronCdpLaunch.ts
486821090045821f5bdb62d8d764532694c55cd0b3fc1402bbb199a9072a2148  apps/duokai2/electron/services/cloakBrowserElectronCdpLaunch.test.ts
e69156d90055923215aa51f7395c22aabaec9f2659a109957a83c7133532f7cc  apps/duokai2/electron/main.ts
a51c88caa8e768e2a4f27b286e1785a3a1f6ae450f5201769eb868b980139d22  apps/duokai2/package.json
55e8ca1b773cd8f27ce637021b0a8d94cd8df0fd10f01e257a0b699492b87608  .pilot-runtime/phase6j-electron-cdp-offline-20260728T163302Z/asar-audit.json
7c7ff6f636016175856c75f5e7882b6f695429482a0ad61f2d68d0d103e1baf7  .pilot-runtime/phase6j-electron-cdp-offline-20260728T163302Z/final-evidence.json
```

## 11. 过程说明

验证过程中出现的非产品问题：

1. 初始测试夹具手写的 ASAR SHA 与夹具内容不一致，有效请求被正确拒绝；修正测试夹具后通过。
2. TypeScript 检出一个测试文件未使用导入；删除后通过。
3. ESLint 拒绝显式 NUL 正则；改为字符码判断，校验语义保持不变。
4. 首个 ASAR 审计 Shell 命令因动态临时目录和复杂内联逻辑被本地安全层拦截，未执行、未改文件；随后使用固定证据目录和可审计 Node 脚本完成同等严格审计。
5. 一个未使用的空 `asar-extract` 证据子目录因目录删除策略要求递归高风险审批而保留。该目录为空，不进入 App 包，不影响测试、构建或结论。

## 12. 最终判定与下一门禁

Phase 6J 已解决 Phase 6I 暴露的启动执行器证据缺口：后续不需要相信外部 `.app` 打开工具是否传递了参数，也不使用模糊的 App 路径状态作为唯一判断。打包 App 自行配置、验证并回执 CDP 状态，所有失败路径均恢复 fail-closed。

因此：

- **Phase 6J 离线实现与包审计：GO**
- **Phase 6H 硬化包真实运行能力：仍待 Phase 6K 验证**
- **Enforce：NO-GO**
- **正式发布：NO-GO**

下一门禁为 **Phase 6K：硬化单引擎包真实单 Profile Observe 复验**。该阶段必须使用新的 rollout ID、空 health 窗口、一次性 CDP 请求与精确 PID 回执，只允许一个 Profile，并在结束后恢复 fail-closed。真实 App/Profile 启动需要新的明确授权，本阶段授权不能自动延伸到 Phase 6K。
