import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import adminUsersRouter from './routes/adminUsers.js';
import adminActionLogsRouter from './routes/adminActionLogs.js';
import adminProfilesRouter from './routes/adminProfiles.js';
import profilesRouter from './routes/profiles.js';
import groupsRouter from './routes/groups.js';
import behaviorsRouter from './routes/behaviors.js';
import settingsRouter from './routes/settings.js';
import profileStorageStateRouter from './routes/profileStorageState.js';
import runtimeRouter from './routes/runtime.js';
import proxyRouter from './routes/proxy.js';
import launchRouter from './routes/launch.js';
import adminAgentsRouter from './routes/adminAgents.js';
import agentV1Router from './routes/agentV1.js';
import { errorMiddleware } from './middlewares/error.js';

const app = express();
const port = Number(process.env.PORT || 3100);
const allowedOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(helmet());
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/action-logs', adminActionLogsRouter);
app.use('/api/admin/profiles', adminProfilesRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/behaviors', behaviorsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/profile-storage-state', profileStorageStateRouter);
app.use('/api/runtime', runtimeRouter);
app.use('/api/proxy', proxyRouter);
app.use('/api/launch', launchRouter);
app.use('/api/admin/agents', adminAgentsRouter);
app.use('/api/agent/v1', agentV1Router);
app.use('/health', healthRouter);

app.use(errorMiddleware);

app.listen(port, () => {
  console.log(`[duokai-api] listening on http://localhost:${port}`);
});
