# Phase 6H — CloakBrowser 单引擎发行包离线硬化报告

- 执行日期：2026-07-28
- 工作树：`~/Documents/duokai-cloakbrowser-phase1-poc`
- 正式仓库：`~/Documents/duokai`（未修改）
- 初始 Task Graph：`task_db1d3174-1147-4718-ad5f-e5a51a110ee5`
- 修复验证续图：`task_b282350e-e441-4a59-a771-45ee83c681e8`
- 阶段结论：**GO — 仅限 Phase 6H 离线单引擎发行边界**
- Enforce 结论：**NO-GO**

## 1. 范围与安全约束

本阶段只执行离线源码、依赖、打包与静态审计：

- 不启动 Electron 应用；
- 不启动 CloakBrowser 或普通 Chromium；
- 不启动任何真实 Profile；
- 不改写 rollout、Pilot、health、生产数据库或正式控制文件；
- 不 commit、merge、push、发布或签发正式安装包；
- 不清理、reset 或覆盖工作树中此前阶段的未提交改动。

`electron-builder --dir` 只生成本地目录包。macOS 目录包使用 ad-hoc 签名，未 notarize，未发布。

## 2. 单引擎边界改造

### 2.1 主启动链 fail-closed

`electron/main.ts` 已删除普通 Playwright Chromium 启动分支，包括：

- `chromium.launchPersistentContext(...)`；
- 普通 Chromium executable 解析；
- Playwright Chromium 环境变量与代理兼容参数；
- 普通 Chromium 启动后的页面、context、storage 与 workspace 成功路径；
- `buildFingerprintInitScript(...)` 生产注入链。

新的启动语义为：

1. Profile 必须通过 CloakBrowser 本地 allowlist、环境门禁和 rollout 准入；
2. CloakBrowser 未准入时记录 `cloak_single_engine_launch_blocked`；
3. 直接抛错阻止启动；
4. `fallbackEngine` 固定为 `forbidden`；
5. 不再静默切换至普通 Chromium。

### 2.2 代理预检不再启动第二套浏览器

旧代理检查通过 Playwright Chromium 启动浏览器并访问 IP 查询服务。Phase 6H 改为：

- 复用现有本地 HTTP proxy bridge；
- 使用 Node `HTTP CONNECT` 建立隧道；
- 在隧道上完成 TLS 握手；
- 直接发送 HTTPS JSON 请求；
- 记录 `proxy_tunnel` 与 `target_probe` 诊断；
- 始终释放 proxy bridge lease。

该路径不启动任何浏览器，因此代理预检不会形成隐藏的普通 Chromium 回退。

### 2.3 运行时辅助模块收口

`electron/services/runtime.ts` 只保留引擎无关函数：

- locale 标准化；
- resolution 标准化；
- WebRTC/通用启动参数整理；
- proxy server 字符串构造。

该文件不再包含 Playwright、Chromium executable、`ms-playwright` 或 Electron Resources 路径解析。

## 3. 依赖与发行资产

`apps/duokai2/package.json` 和 `package-lock.json` 已收口为：

- `cloakbrowser`: **`0.5.2`**；
- `playwright-core`: **`1.58.2`**；
- 直接依赖 `playwright`: **不存在**。

同时已删除：

- `npm run install:chromium`；
- `scripts/prepare-playwright-browsers.mjs`；
- `build.extraResources` 中的 `ms-playwright` 复制规则；
- macOS 对该旧资产的 `signIgnore`；
- `build-resources/ms-playwright/`，删除前约 **161 MB**，其中包含 Playwright Chromium 1208 压缩载荷与 manifest。

说明：`playwright-core` 本身包含协议实现、驱动代码和若干安装辅助脚本名称，但本次 ASAR/Resources 审计确认没有普通 `playwright` 包、`ms-playwright` 浏览器缓存或 Chromium 1208 二进制载荷。

## 4. UI、诊断与文档语义

桌面 UI 与共享类型已改为展示：

- `browserEngine: cloakbrowser`；
- 固定 CloakBrowser 版本；
- CloakBrowser 外部受管缓存目录；
- `fallbackEngine: forbidden`。

关闭 Cloak Pilot 的提示不再声称“回到旧浏览器链路”，而是明确说明后续 Profile 启动会被阻止，直到重新启用 CloakBrowser 并通过 rollout 门禁。

README 与中英文文案已移除普通 Chromium 安装指令，并记录单引擎、完整性校验失败即阻止启动的发行语义。

## 5. 自动化门禁

新增：

`electron/services/cloakBrowserSingleEnginePackaging.test.ts`

覆盖：

1. 精确固定 CloakBrowser 与 `playwright-core` 版本；
2. 禁止直接 `playwright` 依赖与 Chromium 安装脚本；
3. 禁止普通 Chromium 主启动、指纹 init script 与 executable resolver；
4. 要求单引擎阻断审计与 `fallbackEngine: forbidden`；
5. 禁止代理预检启动 Chromium；
6. 禁止旧资产目录与脚本重新出现；
7. 禁止 UI 文案重新引导到 legacy browser path。

## 6. 验证结果

| 门禁 | 结果 |
|---|---:|
| 单引擎聚焦测试 | 3/3 PASS |
| 全量 Cloak 测试 | 153/153 PASS |
| TypeScript `tsc -b` | PASS |
| 改动文件目标 ESLint | PASS |
| package/lock/source 单引擎静态断言 | PASS |
| `git diff --check` | PASS |
| Vite renderer build | PASS |
| Vite Electron main/preload build | PASS |
| `electron-builder --dir` | PASS |

### 6.1 构建产物

- App：`apps/duokai2/release/mac-arm64/Duokai.app`
- App 目录大小：约 **330 MB**
- `app.asar` 大小：约 **56 MB**
- `app.asar` SHA256：`e7625dcfd8172b428ef24b0db4d366f0421feb17a935486a450e9ec55b924898`
- Resources 聚合 SHA256：`ff4bbe6f56796be0061a125e497306e4024b17b083ad3602a4c9101cd9e97d37`

### 6.2 ASAR 审计

- ASAR entries：6542
- `node_modules/cloakbrowser/`：73 entries
- `node_modules/playwright-core/`：397 entries
- `node_modules/playwright/`：0 entries
- `ms-playwright`：0 entries
- `chromium-1208`：0 entries
- 打包 `package.json` 中直接 `playwright`：不存在
- 打包版本：CloakBrowser `0.5.2`、`playwright-core` `1.58.2`

### 6.3 编译产物行为标记

编译后的 `dist-electron/main.js`：

- `chromium.launchPersistentContext`：不存在；
- `resolveChromiumExecutable`：不存在；
- `buildFingerprintInitScript`：不存在；
- `cloak_single_engine_launch_blocked`：存在；
- `fallbackEngine: forbidden`：存在；
- Node proxy `CONNECT`、专用 preflight User-Agent 和 `proxy_tunnel`：存在。

### 6.4 Electron Chromium 边界说明

Electron 桌面壳本身必然携带用于渲染应用 UI 的 Chromium Framework。Phase 6H 的“单引擎”边界是：**Profile 浏览器运行链和发行资产不再包含或调用普通 Playwright-managed Chromium，也不允许静默 fallback**。本阶段不宣称删除 Electron 自身的 UI 渲染引擎。

## 7. 验证过程中的非产品问题

1. 离线执行 `npm install --package-lock-only --offline` 时，npm 因根 workspace 中无关的 `eslint-config-next` 未缓存而返回 `ENOTCACHED`。没有联网、没有安装包。随后只对 lockfile v3 中 Duokai2 的直接依赖节点做结构化删除，并通过 JSON 解析、精确版本断言、测试和实际 electron-builder 打包验证。
2. 初始 Task Graph 在清理旧分支产生的未使用导入时耗尽自动 replan 额度，被标记 blocked；续图保留全部改造并完成验证。
3. 首轮 ASAR 脚本以 Vite 编译后函数名为断言，因内联而误报；最终审计改为检查真实 CONNECT/TLS 行为字符串、包元数据和 ASAR entries，并严格通过。
4. 一次只读 Git 证据脚本在 zsh 循环中误用变量 `path`，覆盖系统 `PATH`，导致脚本后半段命令找不到；未写入或改变项目状态，随后用独立命令完成核对。

## 8. Git 与变更保护

工作树仍包含 Phase 1–6H 的累计未提交改动。Phase 6H：

- 没有 reset、clean、checkout 或覆盖已有变更；
- 没有执行 `git add`、commit、merge、push；
- 没有修改正式仓库；
- 本地 `release/` 目录包仅用于离线审计，不是发布物。

## 9. 决策与下一门禁

### Phase 6H

**GO — 离线单引擎源码、依赖和目录包边界通过。**

### Enforce

**NO-GO。** 原因：

1. Phase 6H 修改了主启动链、代理预检和发行包内容，必须使用该新构建重新执行真实 Observe；
2. 修复后真实成功样本仍未达到治理策略要求的最少 5 条；
3. 任何真实运行仍需单独明确授权；
4. 在新 Observe 通过前应继续保持 Pilot 空、rollout off、batch disabled、kill switch on。

建议下一阶段为 **Phase 6I：硬化包真实单 Profile Observe 复验**。先对同一受控 Profile 做一次新构建 Observe，验证代理预检、trusted、60 秒 post-trust liveness、产品 stop 和最终 fail-closed，再决定如何补齐独立样本窗口。