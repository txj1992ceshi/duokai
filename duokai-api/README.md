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

## Agent 统一管控（一期）

### 关键路由

- 管理端：`/api/admin/agents/*`
- Agent 协议：`/api/agent/v1/*`
- 灰度指标：`GET /api/admin/agents/metrics?windowMinutes=60&runningTimeoutMinutes=10`
- 设备健康摘要：`GET /api/admin/agents/health-summary?windowMinutes=60&runningTimeoutMinutes=10`
- 批量下发任务：`POST /api/admin/agents/tasks/batch`
- 批量吊销设备：`POST /api/admin/agents/revoke/batch`
- 批量取消卡住任务：`POST /api/admin/agents/tasks/cancel-stuck`
- 最近批量操作审计：`GET /api/admin/agents/actions/recent?limit=40&rangeHours=24&adminEmail=admin@example.com`

### Agent 协议请求头

- `x-agent-protocol-version: 1`

### 配置同步

- `GET /api/agent/v1/config/snapshot`
- `POST /api/agent/v1/config/push`
  - `mode=replace`：全量覆盖（默认）
  - `mode=merge`：按 `id` 合并（并做字段白名单过滤）

### Smoke 联调脚本

```bash
API_BASE=http://127.0.0.1:3100 \
ADMIN_IDENTIFIER=<admin_email_or_username> \
ADMIN_PASSWORD=<admin_password> \
npm run smoke:agent
```

### 灰度阈值检查脚本

```bash
API_BASE=http://127.0.0.1:3100 \
ADMIN_IDENTIFIER=<admin_email_or_username> \
ADMIN_PASSWORD=<admin_password> \
WINDOW_MINUTES=60 \
RUNNING_TIMEOUT_MINUTES=10 \
MIN_HEARTBEAT_RATE=99 \
MIN_TASK_SUCCESS_RATE=95 \
MAX_STUCK_RUNNING=0 \
npm run slo:agent
```

说明：

- 默认当 `activeAgents=0` 时会跳过心跳阈值判定，避免“当前无活跃 Agent”导致误报。
- 若需要强制心跳检查，设置 `REQUIRE_ACTIVE_HEARTBEAT=1`。

### Agent 发布前环境检查

```bash
npm run check:agent-env
```

### 一期发布清单

- `docs/agent-phase1-release-checklist.md`
- 一键验收命令：`npm run verify:agent-phase1`

### 协议契约与状态机测试

```bash
npm run lint
npm test
```

- `npm test` 使用 `node:test` 执行 `src/**/*.test.ts`
- 当前覆盖：
  - 任务状态机合法流转
  - ACK 请求体校验
  - heartbeat 字段规范化
