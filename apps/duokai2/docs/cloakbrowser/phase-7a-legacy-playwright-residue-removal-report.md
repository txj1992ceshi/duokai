# Phase 7A：普通 Playwright 残留清理报告

**日期：** 2026-07-30
**分支：** `codex/cloakbrowser-phase1-poc`
**基线提交：** `c3ae0d71e35687f52c48685247e34770a24a4426`
**状态：** Passed

## 1. 目标

在 CloakBrowser 单引擎生产启动链已经落地的基础上，清除仍可能让桌面子应用重新安装或保留普通 Playwright 的依赖与打包配置残留，并建立不可回退测试。

本阶段不启动真实 Profile，不访问生产数据库，不修改 rollout 控制，不执行推送、合并或部署。

## 2. 审计发现

仓库根目录通过 npm workspaces 管理 `apps/duokai2`，根 `package-lock.json` 是有效依赖锁文件。

审计发现两个残留：

1. `apps/duokai2/package-lock.json` 是陈旧的子应用 lockfile，其中仍锁定普通 `playwright`。在子目录被误当作独立 npm 项目处理时，它可能重新引入普通 Playwright，与单引擎约束冲突。
2. `apps/duokai2/vite.config.ts` 的 Electron Rollup external 列表仍包含 `playwright`，虽然生产代码已不再导入它，但该配置仍表达了旧引擎可被运行时解析的过时契约。

## 3. 变更

- 删除 `apps/duokai2/package-lock.json`，统一由仓库根 lockfile 管理依赖。
- 从 Electron Rollup external 列表中移除普通 `playwright`。
- 加强 `cloakBrowserSingleEnginePackaging.test.ts`：
  - 要求子应用目录不存在独立 `package-lock.json`；
  - 要求 Vite 配置不再出现普通 `playwright` external。

根 lockfile 中的单引擎依赖契约保持不变：

- `cloakbrowser`: `0.5.2`
- `playwright-core`: `1.58.2`
- 普通 `playwright`: 非直接依赖

## 4. 验证结果

| 门禁 | 结果 |
| --- | --- |
| 单引擎聚焦测试 | 3/3 passed |
| Cloak Runtime 全量测试 | 194/194 passed |
| ESLint | passed |
| `build:dir` | passed |
| macOS 目录包 ad-hoc 签名 | passed |
| 根 lockfile workspace 解析 | passed |
| 子应用独立 lockfile | absent |
| Vite 普通 Playwright external | absent |

构建日志确认 electron-builder 能从仓库根 `package-lock.json` 解析 workspace，并完成原生依赖准备、Vite/Electron 构建、macOS 目录包打包与 ad-hoc 签名。

## 5. 结论

Phase 7A 通过。

Duokai2 的依赖安装与 Electron 打包配置不再保留普通 Playwright 的子项目入口；新增测试会在子应用 lockfile 或 Vite external 被重新引入时直接失败。CloakBrowser 与固定 `playwright-core` 版本仍是唯一受支持的浏览器引擎契约。

本阶段仅形成隔离分支上的本地变更；未推送、未合并、未部署。
