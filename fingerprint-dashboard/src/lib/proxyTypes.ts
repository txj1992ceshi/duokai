export type ProxyProtocol = 'direct' | 'http' | 'https' | 'socks5';

export type ProxyCheckLayer = 'control' | 'environment';
export type HostEnvironment = 'macos' | 'windows' | 'linux' | 'unknown';
export type HostNetworkMode = 'system_proxy_only' | 'tun_like' | 'unknown';
export type ProxyEntryTransport = 'http-entry' | 'https-entry' | 'socks5-entry' | 'direct';

export type ProxyCheckStatus =
  | 'reachable'
  | 'verified'
  | 'auth_failed'
  | 'timeout'
  | 'no_response'
  | 'vpn_leak_suspected'
  | 'unknown';

export interface ProxyProbeResult {
  transport: 'http' | 'https';
  status: 'verified' | 'auth_failed' | 'timeout' | 'no_response' | 'unknown';
  provider?: string;
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  isp?: string;
  error?: string;
  detail?: string;
}

export interface ProxyVerificationRecord {
  layer: ProxyCheckLayer;
  status: ProxyCheckStatus;
  proxyType?: ProxyProtocol;
  effectiveProxyTransport?: ProxyEntryTransport;
  hostEnvironment?: HostEnvironment;
  networkMode?: HostNetworkMode;
  browserVerified?: boolean;
  latencyMs?: number;
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  isp?: string;
  provider?: string;
  gatewayReachable?: boolean;
  candidateTransport?: ProxyEntryTransport;
  checkedAt?: string;
  error?: string;
  errorType?: ProxyCheckStatus | string;
  detail?: string;
  expectedIp?: string;
  expectedCountry?: string;
  expectedRegion?: string;
  httpProbe?: ProxyProbeResult;
  httpsProbe?: ProxyProbeResult;
}
