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

完整打包：

```bash
npm run build
```

## 说明

- Chromium 由 Playwright 提供，首次运行前需要执行 `npm run install:chromium`
- 环境数据与 SQLite 数据库存储在应用用户目录，不在仓库内
- 当前适合本地测试与小范围内部分发，未做签名、公证与商用发布链路
