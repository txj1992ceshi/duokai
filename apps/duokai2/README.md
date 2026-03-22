# Duokai2

本地多开浏览器桌面项目，当前以本地安装、自用测试为目标。

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

## 安装包与产物

打包完成后，所有产物默认输出到 `/Users/jj/Desktop/bitbrowser-clone/release`。

### macOS

在 Mac 上执行：

```bash
npm run build
```

会生成类似以下文件：

- `Duokai2-0.0.0-arm64.dmg`
- `Duokai2-0.0.0-arm64-mac.zip`
- `mac-arm64/Duokai2.app`

安装方式：

1. 双击 `.dmg`
2. 将 `Duokai2.app` 拖到 `Applications`
3. 从应用程序中直接双击启动

如果只是本机临时测试，也可以直接双击：

- `release/mac-arm64/Duokai2.app`

### Windows

Windows 一键安装包有两种获取方式：

#### 方式 1：直接下载已发布安装包（推荐）

1. 打开 GitHub 仓库的 `Releases` 页面
2. 下载：`Duokai2 Setup.exe`
3. 双击安装
4. 安装完成后从桌面快捷方式或开始菜单启动

补充说明：

- GitHub Actions 还会同步上传 `Actions Artifacts`，便于内部测试下载
- 正式给好友使用时，优先让对方下载 `GitHub Releases` 里的安装包

#### 方式 2：在 Windows 机器上本地打包

在 Windows 机器上执行：

```bash
npm install
npm run install:chromium
npm run build
```

会生成类似以下文件：

- `Duokai2 Setup.exe` 或等价 `NSIS` 安装器
- `Duokai2-win.zip` 便携包

说明：

- 当前阶段未做代码签名
- Windows 安装时可能出现 `SmartScreen` 提示，内测阶段可手动继续
- 当前仓库已支持通过 GitHub Actions 在 `windows-latest` 上手动构建并发布 Windows 安装包

## 说明

- Chromium 由 Playwright 提供，首次运行前需要执行 `npm run install:chromium`
- 环境数据与 SQLite 数据库存储在应用用户目录，不在仓库内
- 当前适合本地测试与小范围内部分发，未做签名、公证与商用发布链路
