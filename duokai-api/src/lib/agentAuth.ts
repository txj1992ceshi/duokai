import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

const AGENT_JWT_SECRET = process.env.AGENT_JWT_SECRET || process.env.JWT_SECRET || '';

if (!AGENT_JWT_SECRET) {
  throw new Error('Missing AGENT_JWT_SECRET (or JWT_SECRET) in environment variables');
}

type AgentAccessPayload = {
  tokenType: 'agent_access';
  agentId: string;
  sessionId: string;
};

type AgentRefreshPayload = {
  tokenType: 'agent_refresh';
  agentId: string;
  sessionId: string;
};

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createRegistrationCode() {
  return randomBytes(18).toString('base64url').slice(0, 24);
}

export function createSessionId() {
  return randomUUID();
}

export function signAgentAccessToken(payload: { agentId: string; sessionId: string }) {
  return jwt.sign(
    {
      tokenType: 'agent_access',
      agentId: payload.agentId,
      sessionId: payload.sessionId,
    } satisfies AgentAccessPayload,
    AGENT_JWT_SECRET,
    { expiresIn: '20m' }
  );
}

export function signAgentRefreshToken(payload: { agentId: string; sessionId: string }) {
  return jwt.sign(
    {
      tokenType: 'agent_refresh',
      agentId: payload.agentId,
      sessionId: payload.sessionId,
    } satisfies AgentRefreshPayload,
    AGENT_JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyAgentAccessToken(token: string) {
  return jwt.verify(token, AGENT_JWT_SECRET) as AgentAccessPayload & {
    iat: number;
    exp: number;
  };
}

export function verifyAgentRefreshToken(token: string) {
  return jwt.verify(token, AGENT_JWT_SECRET) as AgentRefreshPayload & {
    iat: number;
    exp: number;
  };
}
