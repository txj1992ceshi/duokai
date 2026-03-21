# Duokai API

独立 API 服务层，负责：

- 用户认证与权限校验
- MongoDB 数据访问
- Profile / Group / Behavior / Settings / StorageState 接口
- Runtime 协调与代理检测

## 本地开发

1. 复制 `.env.example` 为 `.env.local`
2. 安装依赖
3. 启动开发服务

```bash
npm install
npm run dev
```

默认监听：

- [http://localhost:3100](http://localhost:3100)

## 健康检查

```bash
curl http://localhost:3100/health
```

## 当前迁移状态

- `duokai-admin` 已切到独立 API
- `fingerprint-dashboard` 已切到独立 API
- `fingerprint-dashboard/src/app/api/*` 仍保留，作为迁移期兜底，待验证稳定后逐步删除
