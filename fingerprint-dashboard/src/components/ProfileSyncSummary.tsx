'use client';

type ProfileLike = {
  id: string;
  proxyType?: string;
  proxyHost?: string;
  proxyPort?: string;
  expectedProxyIp?: string;
  ua?: string;
  seed?: string;
  isMobile?: boolean;
};

type Props = {
  profile: ProfileLike;
  syncSummary: 'Ready' | 'Partial' | 'Empty';
  syncSummaryClass: string;
  storageStateSynced: boolean;
};

export default function ProfileSyncSummary({
  profile,
  syncSummary,
  syncSummaryClass,
  storageStateSynced,
}: Props) {
  const syncLabelMap = {
    Ready: '已就绪',
    Partial: '部分完成',
    Empty: '未配置',
  } as const;

  return (
    <div className="space-y-1 text-sm">
      <div className={syncSummaryClass}>同步状态：{syncLabelMap[syncSummary]}</div>

      <div>
        登录态：{storageStateSynced ? '已同步' : '未同步'}
      </div>

      <div>
        代理：{profile.proxyType || 'direct'}
        {profile.proxyHost ? ` | ${profile.proxyHost}` : ''}
        {profile.proxyPort ? `:${profile.proxyPort}` : ''}
        {profile.expectedProxyIp ? ` | IP ${profile.expectedProxyIp}` : ''}
      </div>

      <div>
        指纹：
        {profile.ua ? ' 已设置 UA' : ' 默认 UA'}
        {profile.seed ? ` | Seed ${profile.seed}` : ''}
        {typeof profile.isMobile === 'boolean'
          ? ` | ${profile.isMobile ? '移动端' : '桌面端'}`
          : ''}
      </div>
    </div>
  );
}
