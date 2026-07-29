# Phase 6L 离线启动验证导航竞态与代理 CONNECT 分类硬化报告

- 证据冻结时间：2026-07-28T18:30:15Z
- 实现工作区：`~/Documents/duokai-cloakbrowser-phase1-poc`
- 分支：`codex/cloakbrowser-phase1-poc`
- 原始 Task Graph：`task_1db87e59-1022-4516-a23f-fe9d1be0fa1e`（因聚焦分类修复期间达到图内重规划预算而 blocked）
- 验证续图：`task_ba21cc40-0fdf-48f9-b224-f8e06151227b`
- 阶段性质：纯离线实现、测试、构建与产物审计

## 1. 结论

- **Phase 6L Offline：GO**
- **真实单 Profile Observe：未执行**
- **Enforce：NO-GO**
- **发布：NO-GO**

Phase 6L 关闭了 Phase 6K 暴露的两类离线可修复问题：

1. 启动页导航失败后立即发起第二次 `goto`，可能与浏览器已在进行的错误页或重定向导航竞争。
2. 代理 HTTP CONNECT 非 200 响应被压平为普通字符串，无法可靠区分 407、502、504、其他 4xx/5xx、DNS、TLS 和传输故障。

本阶段没有启动真实 App、Electron、CloakBrowser 或任何 Profile，没有调用产品 `runtime.launch`，没有修改 rollout 控制、用户数据库或正式仓库。

## 2. Phase 6K 依据

Phase 6K 已证明 Electron PID/CDP 一次性启动通道可用，但真实 Profile 在 trust 前失败：

- LinkedIn 导航被 `chrome-error://chromewebdata/` 竞争导航中断；
- 随后的 `page.evaluate` 因导航导致执行上下文销毁；
- 代理预检两次返回 HTTP CONNECT `502`。

因此 Phase 6L 仅针对启动验证的导航收敛和代理失败分类进行离线硬化，不把 Phase 6K 的真实失败样本改写为成功样本。

## 3. 启动导航硬化

新增：

- `electron/services/cloakBrowserStartupNavigation.ts`
- `electron/services/cloakBrowserStartupNavigation.test.ts`

主流程现在具有以下约束：

1. 启动路径只发起 **一次** `page.goto(..., waitUntil: 'commit')`。
2. 即使 `goto` 报告竞争导航，也不再盲目发起第二次导航。
3. 使用有界 `domcontentloaded` 等待，让浏览器当前导航先收敛。
4. 显式识别并 fail-closed：
   - `chrome-error://`
   - `edge-error://`
   - `about:neterror`
5. 最终文档必须稳定在 HTTP(S) URL；`about:blank`、空 URL 或其他非 HTTP(S) 文档不能被判为成功。
6. `page.evaluate` 仅在明确的导航上下文切换错误上允许一次有界恢复；业务断言错误不会重试。
7. 若导航未离开 `about:blank`，保留原始 DNS、TLS、代理等错误分类，不让后续文档检查覆盖根因。
8. 新增审计事件，包括竞争导航、上下文恢复、文档仍在加载和导航信号失败。

静态边界检查结果：

```json
{
  "gotoCount": 1,
  "oldRetryAbsent": true,
  "oldFallbackMessageAbsent": true
}
```

## 4. 代理 CONNECT 失败分类

新增：

- `electron/services/proxyFailureClassification.ts`
- `electron/services/proxyFailureClassification.test.ts`

`proxyCheck.ts` 现在保留原错误消息，并同时输出：

- `failureCode`
- `failureStage`
- `failureHttpStatus`
- `failureRetryable`
- 每条诊断的 `httpStatus`
- 每条诊断的 `retryable`

分类契约：

| 信号 | 代码 | HTTP 状态 | 可重试 |
|---|---|---:|---:|
| CONNECT 407 | `proxy_connect_auth_required` | 407 | false |
| CONNECT 408 / 504 | `proxy_connect_timeout` | 408 / 504 | true |
| CONNECT 502 | `proxy_connect_gateway_failure` | 502 | true |
| 其他 5xx | `proxy_connect_upstream_failure` | 原状态码 | true |
| 其他 4xx | `proxy_connect_rejected` | 原状态码 | false |
| socket timeout / `ETIMEDOUT` | `proxy_connect_timeout` | null | true |
| `ECONNREFUSED` | `proxy_connect_refused` | null | true |
| `ENOTFOUND` / `EAI_AGAIN` / DNS | `proxy_dns_failed` | null | true |
| TLS / SSL / certificate | `proxy_tls_failed` | null | false |
| malformed / protocol / incomplete | `proxy_protocol_error` | null | false |
| `ECONNRESET` / `EPIPE` / socket transport | `proxy_transport_error` | null | true |
| 无法识别 | `proxy_unknown` | null | false |

HTTP 502 不再只是消息文本，而是明确的 `proxy_connect_gateway_failure + httpStatus=502 + retryable=true`。

## 5. 离线验证

| 验证项 | 结果 | Task Graph 命令证据 |
|---|---:|---|
| 导航与代理分类聚焦测试 | **12/12 PASS** | `cmd_c8ed6edb-6d9c-40cf-9766-710e67ae4cf4` |
| 全量 Cloak 回归 | **173/173 PASS** | `cmd_019674a3-36aa-4c58-90c6-8e3e5d9d8b18` |
| 单引擎边界 | **3/3 PASS** | `cmd_acb3a417-5810-4f9b-aa06-db8d659a2aed` |
| TypeScript | PASS | `cmd_b7bca3a4-db10-41fe-9935-64e5140ddfff` |
| 目标 ESLint | PASS | `cmd_c08f63ed-469f-46f3-9dae-591d6e8fed9d` |
| `git diff --check` | PASS | `cmd_b4a7a8bb-4277-45e6-bf74-a83595346ba3` |
| 源码边界断言 | PASS | `cmd_2f1bc589-d7ae-40ee-9d34-f771f1d13889` |
| `npm run build:dir` | PASS | `cmd_e5447e8b-d6f4-4349-a9e9-a44e7a163e82` |
| strict codesign | PASS | `cmd_a9231c88-c59e-4c5d-91e4-7ec5151de452` |
| ASAR 单引擎/编译标记审计 | PASS | `cmd_7b0db8d8-a108-497e-8776-f05158073b75` |

### 5.1 Task Graph 验证器元数据异常

聚焦测试和全量回归都满足以下可复核事实：

- 进程实际完成；
- `exitCode = 0`；
- TAP 摘要完整；
- 分别显示 `pass 12 / fail 0` 和 `pass 173 / fail 0`；
- 实际耗时分别约 260 ms 和 1.313 s。

Task Graph 的附加验证器字段同时错误标记了 `Command timed out`。本报告以进程退出码和完整 TAP 为执行事实，并把冲突字段保留为工具元数据异常，不把它解释为测试失败。

## 6. 离线构建与包边界

构建产物：

```text
~/Documents/duokai-cloakbrowser-phase1-poc/apps/duokai2/release/mac-arm64/Duokai.app
```

构建属性：

- Electron：41.0.2
- 本地 ad-hoc 签名
- strict codesign 验证通过
- 未 notarize
- 未发布
- 构建后未打开 App

`app.asar` SHA256：

```text
7173e2bf5f9f454609ff57bcd2405b1b15d1ca25da816f71999672062f208465
```

ASAR 审计：

```json
{
  "entries": 6542,
  "cloakbrowser": 73,
  "playwrightCore": 397,
  "ordinaryPlaywright": 0,
  "msPlaywright": 0,
  "embeddedCloakBinary": 0,
  "compiledMarkers": {
    "stableNavigation": true,
    "gateway502": true,
    "legacyNavigationRetry": false,
    "legacyFallbackMessage": false
  }
}
```

Electron Framework 自带的 Chromium 仍用于桌面 UI；此处“单引擎”指 Profile 浏览器路径不存在普通 Playwright Chromium 或静默 fallback。

## 7. 保护边界

本阶段：

- 未打开或启动真实 App；
- 未启动 Electron/CDP 通道；
- 未启动 CloakBrowser；
- 未启动「试点 Profile」「非目标 Profile」或其他 Profile；
- 未调用产品 `runtime.launch`；
- 未改变 Pilot、rollout、batch 或 kill switch；
- 未读取或写入用户生产数据库；
- 未修改正式仓库 `~/Documents/duokai`；
- 未清理、重置或覆盖既有未提交改动；
- 未 commit、merge、push、publish 或 notarize。

## 8. 门禁决定

Phase 6L 的离线修复、回归、构建和包边界均通过，因此 **Phase 6L Offline GO**。

该结果只证明离线实现和构建边界，不形成新的真实 health 样本，也不能把 Enforce 改为 GO。因此：

- **Enforce 继续 NO-GO**；
- 下一次真实单 Profile Observe 必须使用新 rollout/nonce/端口；
- 必须重新执行 trust 前后门禁、60 秒/13 样本和显式停止；
- 必须获得新的明确真实启动授权。
