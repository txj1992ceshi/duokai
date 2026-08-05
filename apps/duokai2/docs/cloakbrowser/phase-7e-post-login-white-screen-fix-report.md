# Phase 7E — 登录后白屏根因与修复报告

**状态：**根因已复现并修复；本地回归、生产 bundle 单例校验、macOS 3.6.9 测试包和真实登录后主工作台验收通过。

## 1. 现象

Duokai 3.6.8 测试包可以正常显示登录页，但用户提交有效凭据后，窗口切换为纯白内容区。主进程、preload、Electron Renderer Helper 和应用签名均正常，没有发生 renderer 进程崩溃。

该问题与 CloakBrowser 默认启用的资格判断无直接关系。默认启用逻辑在主工作台渲染前后均未抛错，白屏发生在认证状态切换后首次挂载共享 UI 组件时。

## 2. 精确异常

对已安装 3.6.8 包制作只读诊断复制品，在 HTML 模块脚本之前安装 `window.error` 捕获器，并把 renderer console 转发到主进程结构化启动日志。使用本机已记住的凭据提交登录后捕获到：

```text
Uncaught TypeError: Cannot read properties of null (reading 'useState')
```

首个失败调用来自 Sonner `Toaster`，随后进入 React renderer。登录页在认证前提前返回，不挂载 `MainLayout` 和 `Toaster`，所以登录页可以正常显示；认证成功后 `Toaster` 首次调用 Hook，错误边界尚不存在，React 根渲染被终止，用户看到整窗白屏。

## 3. 根因

3.6.8 打包时使用 package-local/nested 依赖布局。物理 npm 依赖树只有一份 React，但 Vite 8/Rolldown 的细粒度 `manualChunks` 将 CommonJS React runtime 复制进多个手工 vendor chunk：

```text
assets/vendor-react-CZF8P2KV.js
assets/vendor-i18n-Bt6Q6UBE.js
assets/vendor-misc-B1FOJLvL.js
```

其中 `vendor-misc` 同时包含 Sonner 和一份独立 React runtime。ReactDOM renderer 使用 `vendor-react` 中的 runtime，而 Sonner 的 `useState` 使用 `vendor-misc` 中的 runtime。后者的 Hook dispatcher 为 `null`，因此触发登录后白屏。

这不是简单的“磁盘里安装了两份 React”：重复发生在 bundler 输出阶段。仅设置 npm dedupe 或仅移动 Sonner 依赖不足以保证安全，因为 `react-i18next` 分块仍可复制另一份 React runtime。

## 4. 修复

### 4.1 React 与 ReactDOM 单例解析

`vite.config.ts` 使用 `createRequire(import.meta.url)` 从桌面应用根解析 React 和 ReactDOM，并同时设置：

- `resolve.alias.react`；
- `resolve.alias['react-dom']`；
- `resolve.dedupe = ['react', 'react-dom']`。

### 4.2 取消 React 消费者的细粒度 vendor 分块

所有 `node_modules` 统一进入单一 `vendor` chunk，不再拆分 `vendor-react`、`vendor-i18n`、`vendor-misc`、`vendor-motion` 和 `vendor-ui`。这样 CommonJS React runtime 只会实例化一次。

### 4.3 明确 Sonner 依赖所有权

- 桌面应用直接声明 `sonner`；
- 共享 `@duokai/ui` 将 `sonner` 作为 peer dependency；
- React、ReactDOM 和 Sonner 均由最终应用提供。

### 4.4 构建期产物门禁

新增 `scripts/verify-renderer-react-singleton.mjs`，扫描 `dist/**/*.js`：

- React runtime 文件必须严格等于一个；
- Sonner toaster 实现必须存在；
- 没有构建产物时 fail closed。

所有桌面构建入口在 `vite build` 后、electron-builder 前强制运行该门禁，包括测试构建和正式 macOS/Windows release 构建。

坏的 3.6.8 bundle 被该门禁识别为三份 React runtime并拒绝；修复后的 3.6.9 bundle只包含：

```text
assets/vendor-CsmVsZ0h.js
```

### 4.5 Renderer 错误回退

新增顶层 `RendererErrorBoundary`。未来若主界面组件再次发生未处理渲染异常，应用会显示“界面加载失败”和“重新加载”按钮，而不是纯白窗口。错误仍写入 renderer console，不能静默吞掉。

## 5. 版本与真实验收

修复测试包版本提升为 `3.6.9`，避免与有问题的 `3.6.8` 混淆。

对最终、未注入诊断钩子的 `release/mac-arm64/Duokai.app` 执行真实验收：

1. 启动最终生产包；
2. 登录页正常显示；
3. 使用本机已记住的凭据提交登录；
4. 完整主工作台正常显示；
5. 侧栏、概览卡片、CloakBrowser 状态和最近日志区域均完成实际绘制；
6. 未再出现 `useState` 空 dispatcher 或白屏。

诊断复制品没有进入最终 ASAR，最终包中不存在 `__DUOKAI_WINDOW_ERROR__`、`renderer_dom_probe` 或 `renderer_console_message` 诊断钩子。

## 6. 回归结果

- CloakBrowser 标准套件：211/211；
- single-engine / renderer packaging：6/6；
- shared UI tests：2/2；
- deployment / release / nonhuman / rollback policy：12/12；
- TypeScript：通过；
- 本次改动文件 ESLint：通过；
- GitHub Actions YAML：全部可解析；
- 坏 bundle 对照：3 份 React runtime，门禁拒绝；
- 修复 bundle：1 份 React runtime，门禁通过。

## 7. macOS 测试包边界

3.6.9 产物为 arm64、ad-hoc 签名、未 notarize 的测试包。ZIP 完整性、DMG CRC、深度签名、版本号、归档内 React 单例和真实登录后窗口均已验证。

该测试包不能替代正式 Developer ID 签名与 Apple notarization 发布流程。
