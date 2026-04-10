# Duokai2

本地多开浏览器桌面项目，当前以测试包安装、自用验证和小范围内测分发为目标。

## 当前已包含

- 本地环境管理与独立用户数据目录
- 代理管理，支持 `HTTP`、`HTTPS`、`SOCKS5`
- 浏览器环境配置：基础设置、代理设置、常用设置、指纹设置
- 模板、导入导出、运行日志
- 浏览器环境启动/停止与基础运行时控制
- 云手机环境管理页与多 Provider 架构占位

## 技术栈

- `Electron`
- `React + Vite`
- `SQLite` via `better-sqlite3`
- `Playwright Chromium`

## 常用命令

安装依赖并安装 Chromium：

```bash
npm install
npm run install:chromium
```

开发模式：

```bash
npm run dev
```

构建目录产物：

```bash
npm run build:dir
```

完整打包（当前机器对应平台的正式安装产物）：

```bash
npm run build
```

仅构建 mac 测试包：

```bash
npm run build:mac
```

仅构建 Windows 测试包：

```bash
npm run build:win
```

## 安装包与产物

打包完成后，所有产物默认输出到：

- `/Users/jj/Documents/duokai/apps/duokai2/release`

当前桌面端测试版本号来自：

- [package.json](/Users/jj/Documents/duokai/apps/duokai2/package.json)

当前版本：

- `0.1.0-test.3.2`

### macOS

在 Mac 上执行：

```bash
npm install
npm run install:chromium
npm run build:mac
```

会生成类似以下文件：

- `Duokai2-0.1.0-test.3.2-arm64.dmg`
- `Duokai2-0.1.0-test.3.2-arm64-mac.zip`
- `mac-arm64/Duokai2.app`

安装方式：

1. 双击 `.dmg`
2. 将 `Duokai2.app` 拖到 `Applications`
3. 首次打开如果出现系统安全提示，可在右键菜单中选择“打开”，或在“系统设置 > 隐私与安全性”中手动允许

如果只是本机临时测试，也可以直接双击：

- `release/mac-arm64/Duokai2.app`

补充说明：

- 当前阶段未做 Apple Developer ID 签名和 notarization
- 通过 GitHub Releases 分发给好友时，macOS 仍然可以安装使用，但首次打开可能需要手动放行

### Windows

Windows 一键安装包有两种获取方式：

#### 方式 1：直接下载已发布安装包（推荐）

1. 打开 GitHub 仓库的 `Releases` 页面
2. 下载：`Duokai2 Setup 0.1.0-test.3.2.exe`
3. 双击安装
4. 安装完成后从桌面快捷方式或开始菜单启动

补充说明：

- GitHub Actions 还会同步上传 `Actions Artifacts`，便于内部测试下载
- 正式给好友使用时，优先让对方下载 `GitHub Releases` 里的安装包
- 当前阶段未做代码签名，Windows 首次运行时可能出现 `SmartScreen` 提示，内测阶段可手动继续

#### 方式 2：在 Windows 机器上本地打包

在 Windows 机器上执行：

```bash
npm install
npm run install:chromium
npm run build:win
```

会生成类似以下文件：

- `Duokai2 Setup 0.1.0-test.3.2.exe` 或等价 `NSIS` 安装器
- `Duokai2-0.1.0-test.3.2-win.zip` 便携包

说明：

- 当前阶段未做代码签名
- Windows 安装时可能出现 `SmartScreen` 提示，内测阶段可手动继续
- 当前仓库已支持通过 GitHub Actions 在 `windows-latest` 上手动构建并发布 Windows 安装包

## 可重复测试包发布流程

### 1. 调整桌面端版本号

编辑：

- [package.json](/Users/jj/Documents/duokai/apps/duokai2/package.json)

将 `version` 改成新的测试版号，例如：

- `0.1.1-test.1`

### 2. 推送仓库代码

```bash
cd /Users/jj/Documents/duokai
git add .
git commit -m "Prepare desktop test release"
git push origin main
```

### 3. 在 GitHub Actions 构建 GitHub Release 安装包

打开：

- `Actions`
- `Desktop Release`
- `Run workflow`

说明：

- 这个 workflow 会同时在 `macos-latest` 和 `windows-latest` 上构建桌面安装包
- 如果不填写 `release_tag`，workflow 会自动使用 `v` + `apps/duokai2/package.json` 里的版本号
- 例如 package 版本是 `0.1.0-test.3.2`，则 release tag 会自动使用 `v0.1.0-test.3.2`

### 4. 如果只想单独构建 Windows 测试包

打开：

- `Actions`
- `Build Windows Test Package`
- `Run workflow`

适用场景：

- 只需要快速更新 Windows 安装包
- 不需要同时发布 macOS 安装包

### 5. 本地生成 mac 测试包（可选）

```bash
cd /Users/jj/Documents/duokai/apps/duokai2
npm install
npm run install:chromium
npm run build:mac
```

产物在：

- `/Users/jj/Documents/duokai/apps/duokai2/release`

### 6. 下载测试包

最终测试包获取方式：

- mac：GitHub `Releases` 中的 `.dmg` 或 `.zip`，也可使用本地 `release/` 目录中的构建产物
- Windows：GitHub `Releases` 中的 `Duokai2 Setup 0.1.0-test.3.2.exe` 和 `Duokai2-0.1.0-test.3.2-win.zip`

## 说明

- 构建时会自动把当前平台的 Playwright Chromium 打包进测试包资源，便于新机器首次启动环境
- 环境数据与 SQLite 数据库存储在应用用户目录，不在仓库内
- 当前适合本地测试与小范围内部分发，未做 macOS 签名、公证和 Windows 代码签名
- GitHub Releases 方案当前就是默认分发方案，目标是“先能稳定打包、先能安装使用”
