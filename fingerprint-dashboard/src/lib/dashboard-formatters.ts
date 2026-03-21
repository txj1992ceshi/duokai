import type { Profile } from '@/lib/dashboard-types';
import type {
  HostEnvironment,
  ProxyCheckStatus,
  ProxyVerificationRecord,
} from '@/lib/proxyTypes';

const COUNTRY_ALIASES = new Map<string, string[]>([
  ['canada', ['canada', '加拿大', 'ca']],
  ['china', ['china', '中国', 'cn', 'mainland china', '中国大陆']],
  ['hong kong', ['hong kong', '香港', 'hk']],
  ['united states', ['united states', 'usa', 'us', '美国', '美利坚', '美國']],
  ['united kingdom', ['united kingdom', 'uk', 'britain', 'england', '英国', '英國']],
  ['japan', ['japan', '日本', 'jp']],
  ['singapore', ['singapore', '新加坡', 'sg']],
  ['taiwan', ['taiwan', '台湾', '台灣', 'tw']],
  ['south korea', ['south korea', 'korea', '韩国', '韓國', 'kr']],
  ['australia', ['australia', '澳大利亚', '澳洲', 'au']],
  ['germany', ['germany', '德国', '德國', 'de']],
  ['france', ['france', '法国', '法國', 'fr']],
]);

function normalizeGeoValue(value?: string) {
  return String(value || '').trim().toLowerCase();
}

function expandCountryAliases(value?: string) {
  const normalized = normalizeGeoValue(value);
  if (!normalized) return [];

  for (const aliases of COUNTRY_ALIASES.values()) {
    if (aliases.includes(normalized)) {
      return aliases;
    }
  }

  return [normalized];
}

function countryMatches(expectedCountry?: string, actualCountry?: string) {
  const expectedAliases = expandCountryAliases(expectedCountry);
  const actualAliases = expandCountryAliases(actualCountry);
  if (!expectedAliases.length) return true;
  if (!actualAliases.length) return false;
  return expectedAliases.some((alias) => actualAliases.includes(alias));
}

export function getCheckStatusLabel(status?: ProxyCheckStatus | string) {
  switch (status) {
    case 'reachable':
      return '网关可达';
    case 'verified':
      return '真实出口已验证';
    case 'auth_failed':
      return '认证失败';
    case 'timeout':
      return '连接超时';
    case 'no_response':
      return '目标站点无响应';
    case 'vpn_leak_suspected':
      return '出口地区异常';
    default:
      return '未知状态';
  }
}

export function getVerificationTone(result?: ProxyVerificationRecord | null) {
  if (!result) return 'text-slate-500';
  if (result.status === 'verified' || result.status === 'reachable') return 'text-green-400';
  if (result.status === 'vpn_leak_suspected') return 'text-amber-300';
  return 'text-red-400';
}

export function getHostEnvironmentLabel(hostEnvironment?: HostEnvironment) {
  switch (hostEnvironment) {
    case 'macos':
      return 'macOS';
    case 'windows':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return '未知宿主';
  }
}

export function getEntryTransportLabel(transport?: string) {
  switch (transport) {
    case 'https-entry':
      return 'HTTPS entry';
    case 'http-entry':
      return 'HTTP entry';
    case 'socks5-entry':
      return 'SOCKS5 entry';
    case 'direct':
      return 'DIRECT';
    default:
      return '-';
  }
}

export function getStartupNavigationTone(
  profile: Pick<Profile, 'startupNavigation' | 'runtimeSessionId'>
) {
  if (!profile.runtimeSessionId) return 'text-slate-500';
  if (profile.startupNavigation?.ok === false) return 'text-amber-300';
  if (profile.startupNavigation?.ok === true) return 'text-green-400';
  return 'text-slate-500';
}

export function getStartupNavigationLabel(
  profile: Pick<Profile, 'startupNavigation' | 'runtimeSessionId' | 'startupPlatform' | 'startupUrl'>
) {
  if (!profile.runtimeSessionId) return '';
  if (!profile.startupUrl) return '平台页: 未指定';
  if (profile.startupNavigation?.ok === false) return '平台页: 打开失败';
  if (profile.startupNavigation?.ok === true) return '平台页: 已打开';
  return '平台页: 待确认';
}

export function formatExpectedGeo(
  profile: Pick<Profile, 'expectedProxyCountry' | 'expectedProxyRegion'>
) {
  return [profile.expectedProxyCountry, profile.expectedProxyRegion].filter(Boolean).join(' / ');
}

export function formatExpectedTarget(
  profile: Pick<Profile, 'expectedProxyIp' | 'expectedProxyCountry' | 'expectedProxyRegion'>
) {
  const bits = [profile.expectedProxyIp?.trim(), formatExpectedGeo(profile)].filter(Boolean);
  return bits.join(' · ');
}

export function getProfileStatusTone(
  profile: Pick<Profile, 'status' | 'runtimeSessionId'>,
  isStarting = false
) {
  if (isStarting) return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
  if (profile.runtimeSessionId || profile.status === 'Running') {
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
  }
  return 'bg-slate-700/50 text-slate-300 border-slate-600/40';
}

export function getProfileStatusLabel(profile: Pick<Profile, 'status'>, isStarting = false) {
  if (isStarting) return '启动中';
  if (profile.status === 'Ready') return '就绪';
  return profile.status || '未知';
}

export function getProfileSyncSummary(profile: {
  proxyType?: string;
  proxyHost?: string;
  proxyPort?: string;
  ua?: string;
  seed?: string;
  isMobile?: boolean;
  startupUrl?: string;
  startupPlatform?: string;
}): 'Ready' | 'Partial' | 'Empty' {
  const hasProxy = profile.proxyType === 'direct' || !!profile.proxyHost || !!profile.proxyPort;
  const hasFingerprint =
    !!profile.ua || !!profile.seed || typeof profile.isMobile === 'boolean';
  const hasEnvironment = !!profile.startupUrl || !!profile.startupPlatform;

  if (hasProxy && hasFingerprint && hasEnvironment) return 'Ready';
  if (hasProxy || hasFingerprint || hasEnvironment) return 'Partial';
  return 'Empty';
}

export function getSyncSummaryClass(status: 'Ready' | 'Partial' | 'Empty') {
  if (status === 'Ready') return 'text-green-600';
  if (status === 'Partial') return 'text-yellow-600';
  return 'text-gray-500';
}

export function getExpectationMismatchMessage(
  result: ProxyVerificationRecord | null | undefined,
  profile: Pick<Profile, 'expectedProxyIp' | 'expectedProxyCountry' | 'expectedProxyRegion'>
) {
  if (!result) return '';
  if (result.status === 'vpn_leak_suspected') {
    return result.error || result.detail || '浏览器出口与期望代理信息不一致';
  }

  const expectedIp = profile.expectedProxyIp?.trim();
  if (expectedIp && result.ip && result.ip !== expectedIp) {
    return `已连通但出口不是预期 IP：当前 ${result.ip}，期望 ${expectedIp}`;
  }

  const expectedCountry = profile.expectedProxyCountry?.trim().toLowerCase();
  const expectedRegion = profile.expectedProxyRegion?.trim().toLowerCase();
  const actualCountry = String(result.country || '').trim().toLowerCase();
  const actualRegion = String(result.region || '').trim().toLowerCase();
  const actualCity = String(result.city || '').trim().toLowerCase();

  if (expectedCountry && actualCountry && !countryMatches(profile.expectedProxyCountry, result.country)) {
    return `已连通但地区不符：当前 ${result.country || '-'} ${result.region || ''}，期望 ${formatExpectedGeo(profile)}`;
  }
  if (
    expectedRegion &&
    actualRegion &&
    !actualRegion.includes(expectedRegion) &&
    !actualCity.includes(expectedRegion)
  ) {
    return `已连通但地区不符：当前 ${result.country || '-'} ${result.region || ''}，期望 ${formatExpectedGeo(profile)}`;
  }
  return '';
}
