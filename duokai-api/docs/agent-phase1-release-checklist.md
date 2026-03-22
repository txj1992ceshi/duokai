# Agent 一期发布清单（duokai + duokai2）

## 1. 代码质量门禁

在本地执行：

```bash
# duokai-api
cd /Users/jj/Desktop/duokai/duokai-api
npm run lint
npm test
npm run build

# duokai-admin
cd /Users/jj/Desktop/duokai/duokai-admin
npm run lint

# duokai2
cd /Users/jj/Desktop/duokai2
npm run lint
npx tsc -b
```

或一键执行（推荐）：

```bash
cd /Users/jj/Desktop/duokai/duokai-api
npm run verify:agent-phase1
```

- 默认：缺少管理员凭据时会跳过 `smoke:agent` 和 `slo:agent`，但不会报错退出。
- 严格模式：`STRICT_AGENT_VERIFY=1 npm run verify:agent-phase1`，缺少凭据会直接失败。

## 2. 环境变量检查（必做）

```bash
cd /Users/jj/Desktop/duokai/duokai-api
npm run check:agent-env
```

必须存在：

- `ADMIN_IDENTIFIER`
- `ADMIN_PASSWORD`

可选：

- `API_BASE`（默认 `http://127.0.0.1:3100`）

## 3. 联调与灰度验证

先跑烟测：

```bash
cd /Users/jj/Desktop/duokai/duokai-api
npm run smoke:agent
```

再跑阈值校验：

```bash
cd /Users/jj/Desktop/duokai/duokai-api
npm run slo:agent
```

一期阈值：

- 心跳活跃率 >= 99%
- 任务成功率 >= 95%
- 卡住 RUNNING = 0

## 4. 管理端人工验收项

- Agent 管控页可查看：
  - Agent 状态/最近心跳
  - 成功率/卡住 RUNNING/最近任务
  - 任务与事件看板
  - 最近批量操作审计（含筛选、导出）
- 批量操作可用：
  - 风险 Agent 批量拉取配置
  - 风险 Agent 批量吊销
  - 批量取消卡住任务

## 5. 回滚预案

如果灰度异常，按顺序执行：

1. 在 `duokai-admin` 暂停批量操作，先只保留只读监控。
2. 停止 `duokai2` Agent 模式（移除 `apiBase/agentId/registrationCode` 配置），恢复本地模式。
3. 在 `duokai-api` 侧禁用 Agent 路由入口（临时注释 `server.ts` 中 agent 相关挂载并重启）。
4. 保留已有 Mongo 集合数据（`agents` / `agent_sessions` / `control_tasks` / `task_events` / `agent_config_states`），不做破坏性删除。

## 6. 发布后 24 小时观测

- 每 30 分钟查看一次 Agent 管控页总览 + 风险 Agent 数。
- 核对最近批量操作记录，确认无误操作。
- 24 小时结束后保存 `slo:agent` 输出 JSON 作为验收记录。
