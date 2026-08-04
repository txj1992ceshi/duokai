# Phase 7D — CloakBrowser 单引擎默认开启报告

**状态：**实现完成；本地类型检查、迁移验证、CloakBrowser 全量回归、UI 与非人工策略回归通过。macOS/Windows 产物与远端精确 SHA 证据按发布流程另行记录。

## 1. 背景与决策

Phase 5 的 `Cloak Pilot` 默认关闭和精确 Profile allowlist，适用于当时“新旧浏览器并存、只允许少量试点环境进入 CloakBrowser”的阶段。Phase 7 已物理移除普通 Playwright Chromium 的生产入口，并规定 CloakBrowser 为唯一浏览器引擎、fallback forbidden。

在单引擎条件下继续把本地 Pilot allowlist 默认设为空，会形成不可恢复的用户态死路：CloakBrowser 被本地资格门禁阻止，同时旧引擎也禁止回退。该本地资格开关因此不再属于普通用户功能，而应转换为“默认使用唯一引擎，内部发布控制仍可暂停”的模型。

本阶段作出以下决策：

- 所有有效 Profile 默认具备 CloakBrowser 本地资格；
- 普通桌面 UI 不再提供“启用/关闭 Cloak Pilot”；
- rollout、批次、健康熔断和 kill switch 继续作为内部安全控制；
- canary rehearsal 继续要求显式、精确、单 Profile allowlist，不能借默认开启绕过；
- Electron CDP 启动失败恢复仍显式进入 default-off fail-closed 状态；
- 旧配置兼容迁移必须无损区分“历史空名单”和“历史精确试点名单”。

## 2. 本地配置 schema v2

`pilot-config.json` 从 schema 1 升级到 schema 2：

```json
{
  "schemaVersion": 2,
  "defaultEnabled": true,
  "enabledProfileIds": [],
  "disabledProfileIds": [],
  "updatedAt": ""
}
```

语义如下：

- `defaultEnabled=true`：正常 Profile 默认使用 CloakBrowser；
- `enabledProfileIds`：内部显式启用覆盖，主要用于精确测试或兼容工具；
- `disabledProfileIds`：内部精确暂停覆盖，优先于默认开启；
- 无效 Profile ID、通配符和不安全文件权限仍 fail closed。

### 2.1 schema 1 兼容迁移

- 文件缺失：在内存中解释为 schema 2、`defaultEnabled=true`；
- schema 1 且 `enabledProfileIds=[]`：解释为历史默认关闭状态，迁移为 `defaultEnabled=true`；
- schema 1 且名单非空：保留为 `defaultEnabled=false` 的精确 allowlist；
- schema 1 的非空无效名单（例如 `['*']`）：保持 default-off，不能因规范化为空而意外全量开启。

读取迁移不立即改写磁盘；下一次内部受控写入才原子持久化 schema 2，文件继续使用私有权限。

## 3. 用户界面与 IPC 边界

桌面端已移除环境菜单中的“启用 Cloak Pilot / 关闭 Cloak Pilot”，并删除整条 renderer mutation 链路：

- React action 和 props；
- `DesktopApi.cloakPilot.setProfileEnabled`；
- preload 暴露；
- renderer 可调用 IPC channel；
- 主进程对应 IPC handler。

只读状态查询仍保留。若内部安全策略显式暂停 Profile，列表展示“Cloak 安全策略暂停”，而不是暗示用户可自行打开或关闭唯一浏览器引擎。

## 4. 安全控制未被削弱

本阶段只改变“本地正常 Profile 是否默认具备唯一引擎资格”，没有放宽以下控制：

- rollout `enforce` 模式下的全局 kill switch；
- 批次 enabled/kill switch；
- 精确 Profile 批次范围；
- 健康熔断、失败率、连续失败和并发限制；
- 固定浏览器版本与二进制 SHA256；
- startup、liveness、可信快照和代理出口验证；
- canary promotion 的 Observe 证据与 owner confirmation；
- Electron CDP 异常后的 fail-closed 恢复。

`rollout mode=off` 的既有定义是“不执行 rollout 强制阻断”，其 admission 结果为 `admitted=true, reason=control_off`；它不是导致本次用户启动失败的原因。启动失败来自 schema 1 空本地 allowlist。

## 5. 目标 Profile 只读迁移验证

对实际本机配置进行只读加载，目标 Profile：

```text
88f6db7a-1756-4957-adee-d6853df9388b
```

旧 schema 1 空名单被规范化为：

```text
defaultEnabled=true
enabledProfileIds=[]
disabledProfileIds=[]
eligibility.enabled=true
eligibility.reason=default_enabled
```

因此安装本阶段构建的新桌面包后，该 Profile 不需要再次点击任何 Pilot 菜单即可进入正常 CloakBrowser 启动流程；后续仍会接受代理、安装、可信身份及内部 rollout 门禁检查。

## 6. 本地验证

- TypeScript project build：通过；
- focused Pilot / canary / CDP / production tests：29/29；
- Pilot schema 与 UI/IPC 回归：8/8；
- single-engine packaging boundary：5/5；
- CloakBrowser 标准全量回归：210/210；
- shared UI token tests：2/2；
- deployment / desktop release / nonhuman / rollback policy tests：12/12；
- GitHub Actions YAML parse：全部通过；
- `git diff --check`：通过。

项目级 ESLint 在本阶段修改前已存在 React 19 新规则错误，位于 CloudPhones、Proxies、ProfileDrawer、App 及旧 workspace hooks；本阶段未扩大范围修复这些无关存量问题。所有类型检查、运行时测试和发布策略检查均独立记录。

## 7. 发布边界

本阶段生成的本地 macOS 包仍属于测试包：arm64、ad-hoc 签名、未使用 Developer ID、未 notarize。正式发布仍须使用更高版本号和完整 Apple/Windows 签名凭据，通过正式 release workflow 创建不可变草稿。
