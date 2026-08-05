# Duokai 3.6.11 CloakBrowser 启动稳定性修复报告

## 背景

Duokai 3.6.10 在 macOS 上启动环境时出现两个用户可见回归：

1. CloakBrowser 打开后被主动关闭，并由调度器再次打开，形成连续的“打开 → 关闭 → 再打开”循环。
2. 在到达用户指定启动网址前，可见主标签页会依次访问保存过 `localStorage` 的其他 origin。

本报告记录 3.6.11 的根因、修复边界和验收结果。

## 根因一：macOS UA Client Hints 版本校验错误

3.6.10 将缩减 User-Agent 中兼容用的固定 token `Mac OS X 10_15_7` 同时作为 UA Client Hints `platformVersion` 的期望值。实际 CloakBrowser 暴露的高熵 UA-CH 平台版本来自有效运行时身份，因此真实启动日志出现：

```text
Cloak UA Client Hints coherence failed: platformVersion: expected "10.15.7", observed "15.2.0"
```

该错误发生在启动事务的 startup verification 阶段。事务按 fail-closed 规则回滚并关闭浏览器。

### 3.6.11 修复

- 缩减 UA 继续保留 Chromium 兼容形式 `Mac OS X 10_15_7`。
- Electron 主进程通过 `process.getSystemVersion()` 读取实际 macOS 版本。
- 仅在内存中的 Cloak 运行时 Profile 覆盖 `advanced.operatingSystemVersion`，用于生成 UA-CH `platformVersion`。
- 数据库中的稳定机器身份不因每次启动被重写。
- 无效的宿主版本字符串 fail-closed。

最终打包应用隔离 Smoke 中，缩减 UA 仍为 `10_15_7`，UA-CH `platformVersion` 与当前宿主运行时版本一致，Client Hints 一致性验证通过。

## 根因二：调度器无差别重试确定性错误

3.6.10 的 `RuntimeScheduler` 对所有启动异常统一执行 `launchRetries`。身份不一致、rollout 禁止、配置非法等确定性错误不会因重试自行恢复，却仍会重新排队启动，从而重复创建和关闭浏览器。

### 3.6.11 修复

- 新增 `NonRetryableLaunchError`，显式标记确定性失败。
- 调度器沿嵌套 `cause` 链识别 `retryable=false`。
- rollout 门禁、Pilot 配置、Profile 验证、机器身份映射和 Client Hints 一致性错误立即进入 Error，启动次数严格为一次。
- 临时网络或瞬时启动错误仍保留原有有限重试能力。

回归测试覆盖：

- 直接确定性错误只启动一次；
- 被多层事务错误包装后仍只启动一次；
- 临时错误仍按配置进行有限重试。

## 根因三：可见主页被用于恢复多 origin localStorage

旧实现复用 `context.pages()[0]` 并逐个执行：

```ts
await page.goto(originState.origin)
```

因此用户会看到历史站点依次加载，最后才进入指定启动网址。

### 3.6.11 修复

- 已有持久化 Profile 优先使用 Chromium 自己的本地存储，不重复导入 origin 数据。
- 只有首次创建或云端 storage state 确实更新时才执行 origin 恢复。
- 恢复使用一次性 helper page；用户主页面保持在前台且不执行任何历史 origin 导航。
- helper page 完成恢复后关闭；主页面只导航一次到用户指定网址。
- cookies 仍通过 BrowserContext API 恢复。
- 记录 `restoredOrigins`、`restoredEntries`、`skippedOrigins` 和 warning 数量，便于审计。

真实 CloakBrowser 145 smoke 证明：

- 恢复过程中主页面始终为 `about:blank`；
- helper page 访问恢复 origin 并正确写入 localStorage；
- helper page 关闭后只剩一个页面；
- 主页面只发生一次 HTTP(S) 导航并到达目标网址；
- 目标页读取到恢复后的 localStorage 值。

## 产品级验收

最终 3.6.11 ZIP 内 `.app` 使用隔离 userData 执行完整桌面 Smoke：

- 应用版本：3.6.11；
- CloakBrowser：145.0.7632.109.2；
- 精确二进制 SHA256 验证通过；
- 环境仅启动一次并进入 `trusted`；
- `retryCounts` 为空；
- 无 `cloak_client_hints_coherence_failed`；
- 最终页面为 `https://example.com/`；
- runtime screenshot 与 probe 成功；
- rollout 控制在 Smoke 完成后恢复为 fail-closed 默认值；
- 全程使用隔离数据库和 Profile，未读取或修改真实用户 Profile。

## 回归与构建结果

- CloakBrowser 标准回归：239/239 通过；
- 针对性测试：36/36 通过；
- TypeScript：通过；
- 改动文件 ESLint：通过；
- 部署与发布策略：12/12 通过；
- Workflow YAML：11/11 解析通过；
- Renderer React singleton：通过；
- macOS ZIP：完整性通过；
- macOS DMG：CRC 与卷结构通过；
- build/ZIP/DMG 内应用：arm64、Electron 41.0.2、版本 3.6.11；
- `codesign --verify --deep --strict`：通过；
- 签名边界：ad-hoc、未 Developer ID 签名、未 notarize；Gatekeeper 拒绝符合本地测试包预期。

## 安全边界

- 未修改 `/Users/jj/Documents/duokai`。
- 未覆盖 `/Applications/Duokai.app`。
- 未修改真实 `领英1` Profile 或真实用户数据库。
- 未触发生产部署或正式签名发布。
