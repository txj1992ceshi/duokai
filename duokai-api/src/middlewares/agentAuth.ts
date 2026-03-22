import type { NextFunction, Request, Response } from 'express';
import { verifyAgentAccessToken } from '../lib/agentAuth.js';
import { connectMongo } from '../lib/mongodb.js';
import { AgentModel } from '../models/Agent.js';
import { AgentSessionModel } from '../models/AgentSession.js';

export type AuthenticatedAgent = {
  agentId: string;
  sessionId: string;
  iat: number;
  exp: number;
};

declare global {
  namespace Express {
    interface Request {
      agentAuth?: AuthenticatedAgent;
    }
  }
}

function readBearer(req: Request) {
  const raw = req.header('authorization') || '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

export async function requireAgent(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readBearer(req);
    if (!token) {
      throw new Error('Unauthorized');
    }
    const payload = verifyAgentAccessToken(token);
    if (payload.tokenType !== 'agent_access') {
      throw new Error('Unauthorized');
    }
    req.agentAuth = {
      agentId: payload.agentId,
      sessionId: payload.sessionId,
      iat: payload.iat,
      exp: payload.exp,
    };

    await connectMongo();
    const [session, agent] = await Promise.all([
      AgentSessionModel.findOne({
        sessionId: payload.sessionId,
        agentId: payload.agentId,
        revokedAt: null,
      })
        .select({ _id: 1, expiresAt: 1 })
        .lean(),
      AgentModel.findOne({
        agentId: payload.agentId,
        status: { $ne: 'DISABLED' },
      })
        .select({ _id: 1 })
        .lean(),
    ]);

    if (!session || !agent || session.expiresAt.getTime() <= Date.now()) {
      throw new Error('Unauthorized');
    }
    next();
  } catch {
    const error = new Error('Unauthorized') as Error & { statusCode?: number };
    error.statusCode = 401;
    next(error);
  }
}

export function requireAgentProtocolV1(req: Request, _res: Response, next: NextFunction) {
  const protocol = String(req.header('x-agent-protocol-version') || '').trim();
  if (protocol !== '1') {
    const error = new Error('Unsupported agent protocol version') as Error & { statusCode?: number };
    error.statusCode = 400;
    next(error);
    return;
  }
  next();
}
