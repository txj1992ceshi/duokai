# Duokai Admin 部署说明

## 环境变量

复制 `.env.example` 为 `.env.local`，并配置：

- `NEXT_PUBLIC_DUOKAI_API_BASE`
  - 功能：Duokai 主站 / API 服务地址
  - 本地开发示例：`http://localhost:3100`
  - 生产环境示例：`https://your-duokai-api-domain.com`

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run start
```
