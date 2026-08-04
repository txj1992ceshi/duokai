# Phase 6M 硬化包真实单 Profile Observe 报告

## 结论

- Phase 6M Observe：**GO**。
- Enforce：**NO-GO**。本阶段仅形成 1 个新的有效真实样本，尚不足以满足最少 5 个新鲜串行样本的放量门槛。
- 正式发布：**NO-GO**。

## 范围与约束

- 目标 Profile：`试点 Profile`（`<pilot-profile-id>`）。
- `非目标 Profile`（`<non-target-profile-id>`）全程保持 `stopped`。
- 单次、串行、Observe 模式；没有并发、重试、提交、合并、推送或发布。
- 正式仓库 `~/Documents/duokai` 未修改。

## 身份与启动通道

- rollout：`phase6m-observe-20260728T184455Z`。
- batch：`single-linkedin1-phase6m`。
- Electron PID：`73272`。
- CDP：`127.0.0.1:55324`，ready receipt 校验通过，请求已一次性消费。
- Electron endpoint：`Chrome/146.0.7680.72`。
- `app.asar` SHA256：`7173e2bf5f9f454609ff57bcd2405b1b15d1ca25da816f71999672062f208465`。
- CloakBrowser Chromium SHA256：`79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79`。

## 观察结果

- trusted observed：`2026-07-28T18:51:07.204Z`。
- trusted 时健康结果数：`0`，未发生提前成功。
- 延迟成功原因：`post_trust_liveness_passed`。
- post-trust 门控：`60,143 ms`，`13` 个采样。
- trusted 后外部观察：`90,030 ms`。
- 门控后保持 `running + trusted`，无失败、无 fatal audit match、无普通浏览器启动证据。
- 网络诊断：CloakBrowser 引擎，出口 `5.42.159.43`（France），本样本未出现 proxy preflight failure。

## 停止与恢复

- 通过产品 `runtime.stop` 显式停止。
- 关闭分类：`explicit-close`，`closeIntent=stop`。
- 最终 `试点 Profile=stopped`、`非目标 Profile=stopped`。
- runtime lock 与 production transaction 均不存在。
- Pilot `enabledProfileIds=[]`。
- rollout `mode=off`、`globalKillSwitch=true`。
- batch `enabled=false`、`killSwitch=true`。
- Electron App 已退出，PID `73272` 不存在，端口 `55324` 无监听。

## 非阻断警告

目录构建包没有 `Contents/Resources/app-update.yml`，自动更新检查记录了 `ENOENT`。该警告没有触发运行生命周期失败，也不改变本次 Observe 样本的有效性；正式安装包/发布验收仍需单独补齐更新元数据。

## 证据

- `.pilot-runtime/phase6m-observe-20260728T184455Z/run-phase6m-observe.mjs`
- `.pilot-runtime/phase6m-observe-20260728T184455Z/attempt-r1/result.json`
- `.pilot-runtime/phase6m-observe-20260728T184455Z/attempt-r1/post-trust-gate.json`
- `.pilot-runtime/phase6m-observe-20260728T184455Z/attempt-r1/stability-samples.json`
- `.pilot-runtime/phase6m-observe-20260728T184455Z/attempt-r1/stopped-status.json`
- `.pilot-runtime/phase6m-observe-20260728T184455Z/attempt-r1/failclosed-control.json`
- `.pilot-runtime/phase6m-observe-20260728T184455Z/attempt-r1/app-close.json`
