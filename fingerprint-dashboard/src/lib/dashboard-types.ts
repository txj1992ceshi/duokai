import type {
  HostEnvironment,
  ProxyProtocol,
  ProxyVerificationRecord,
} from '@/lib/proxyTypes';

export interface Profile {
  id: string;
  name: string;
  status: string;
  lastActive: string;
  tags: string[];
  proxy?: string;
  proxyType?: ProxyProtocol;
  proxyHost?: string;
  proxyPort?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  proxyTypeSource?: 'explicit' | 'inferred' | 'direct';
  expectedProxyIp?: string;
  preferredProxyTransport?: ProxyProtocol;
  lastResolvedProxyTransport?: ProxyProtocol;
  lastHostEnvironment?: HostEnvironment;
  expectedProxyCountry?: string;
  expectedProxyRegion?: string;
  ua?: string;
  seed?: string;
  isMobile?: boolean;
  groupId?: string;
  runtimeSessionId?: string;
  proxyVerification?: ProxyVerificationRecord;
  startupPlatform?: string;
  startupUrl?: string;
  startupNavigation?: {
    ok: boolean;
    requestedUrl?: string;
    finalUrl?: string;
    error?: string;
  };
}

export type BehaviorAction = {
  type: string;
  url?: string;
  selector?: string;
  [key: string]: unknown;
};

export interface Behavior {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  actions: BehaviorAction[];
}

export type GroupItem = {
  id: string;
  name: string;
  color?: string;
  notes?: string;
};

export type ProxyListItem = {
  id: string;
  host: string;
  port: string;
  type: 'HTTP' | 'SOCKS5';
  status: string;
  delay: string;
  city: string;
};

export interface Settings {
  runtimeUrl: string;
  runtimeApiKey: string;
  autoFingerprint: boolean;
  autoProxyVerification: boolean;
  defaultStartupPlatform: string;
  defaultStartupUrl: string;
  theme: string;
}

export type DashboardTab =
  | '控制台'
  | '浏览器环境'
  | '手机环境'
  | '自动化流程'
  | '团队分组'
  | '代理 IP'
  | '扩展程序'
  | '系统设置';

export type CurrentUserSummary = {
  email?: string;
  username?: string;
  name?: string;
  role?: string;
} | null;
