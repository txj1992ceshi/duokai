'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import AppButton from '@/components/AppButton';
import AppSelect from '@/components/AppSelect';
import ErrorBanner from '@/components/ErrorBanner';
import SuccessBanner from '@/components/SuccessBanner';
import PageSkeleton from '@/components/PageSkeleton';
import DetailCard from '@/components/DetailCard';
import PageHeader from '@/components/PageHeader';
import CardGrid from '@/components/CardGrid';
import SectionBlock from '@/components/SectionBlock';

type ProfileDetail = {
  id: string;
  userId?: string;
  name: string;
  status: string;
  groupId?: string;
  proxyType?: string;
  proxyHost?: string;
  proxyPort?: string;
  expectedProxyIp?: string;
  ua?: string;
  seed?: string;
  isMobile?: boolean;
  startupPlatform?: string;
  startupUrl?: string;
  storageStateSynced?: boolean;
  ownerEmail?: string;
  ownerName?: string;
  createdAt?: string;
  updatedAt?: string;
  canonicalSyncVersion?: number;
  lastEnvironmentSyncStatus?: string;
  lastEnvironmentSyncMessage?: string;
  lastEnvironmentSyncVersion?: number;
  autoSyncTaskCount?: number;
  lastAutoPushAt?: string;
  lastAutoPullAt?: string;
  lastAutoSyncError?: string;
  lastWriterDeviceId?: string;
};

type AdminUser = {
  id: string;
  email: string;
  name?: string;
  status?: string;
};

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getSyncProfile(profile: ProfileDetail): 'Ready' | 'Partial' | 'Empty' {
  const hasProxy =
    profile.proxyType === 'direct' ||
    Boolean(profile.proxyHost) ||
    Boolean(profile.proxyPort);
  const hasFingerprint =
    Boolean(profile.ua) || Boolean(profile.seed) || typeof profile.isMobile === 'boolean';
  const hasEnvironment = Boolean(profile.startupPlatform) || Boolean(profile.startupUrl);

  if (hasProxy && hasFingerprint && hasEnvironment) return 'Ready';
  if (hasProxy || hasFingerprint || hasEnvironment) return 'Partial';
  return 'Empty';
}

export default function ProfileDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const profileId = String(params?.id || '');

  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const auth = readAdminAuth();
    if (!auth.ok) {
      router.replace('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked || !profileId) return;

    async function loadProfileDetail() {
      setLoading(true);
      setError('');
      try {
        const [profileRes, usersRes] = await Promise.all([
          adminFetch(`/api/admin/profiles/${profileId}`),
          adminFetch('/api/admin/users'),
        ]);
        const data = await profileRes.json();
        const usersData = await usersRes.json();

        if (!profileRes.ok || !data.success) {
          setError(data.error || '加载环境详情失败');
          return;
        }

        const p = data.profile as ProfileDetail;
        setProfile(p);
        setTargetUserId(String(p.userId || ''));
        setUsers(
          usersRes.ok && usersData?.success && Array.isArray(usersData.users)
            ? usersData.users.filter((user: AdminUser) => user.status !== 'disabled')
            : []
        );
      } catch {
        setError('加载环境详情失败');
      } finally {
        setLoading(false);
      }
    }

    loadProfileDetail();
  }, [authChecked, profileId]);

  async function handleTransferOwnership() {
    if (!profile) return;
    if (!targetUserId || targetUserId === profile.userId) return;
    if (!window.confirm('确认将这个环境转移给选中的用户吗？')) return;

    setError('');
    setSuccess('');

    try {
      const res = await adminFetch(`/api/admin/profiles/${profile.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId: targetUserId }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '转移环境归属失败');
        return;
      }

      const nextProfile = data.profile as ProfileDetail;
      setProfile(nextProfile);
      setTargetUserId(String(nextProfile.userId || ''));
      setSuccess('环境归属已更新');
    } catch {
      setError('转移环境归属失败');
    }
  }

  if (!authChecked) return null;
  if (loading) return <PageSkeleton title="加载环境详情中..." rows={4} />;
  if (!profile) return <div className="text-sm text-neutral-400">环境不存在</div>;

  const syncProfile = getSyncProfile(profile);

  return (
    <div className="space-y-6">
      <PageHeader title="环境详情" description={profile.name} />

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <SectionBlock title="环境概览" description="查看环境的基础配置、归属与同步状态。">
        <CardGrid columns="two">
          <DetailCard title="基本信息">
            <div>名称：{profile.name || '-'}</div>
            <div>状态：{profile.status || '-'}</div>
            <div>groupId：{profile.groupId || '-'}</div>
            <div>创建时间：{formatDateTime(profile.createdAt)}</div>
            <div>更新时间：{formatDateTime(profile.updatedAt)}</div>
          </DetailCard>

          <DetailCard title="归属用户">
            <div>ownerName：{profile.ownerName || '-'}</div>
            <div>ownerEmail：{profile.ownerEmail || '-'}</div>
            <div>userId：{profile.userId || '-'}</div>
          </DetailCard>

          <DetailCard title="归属管理">
            <AppSelect
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
            >
              <option value="">请选择目标用户</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.email}
                </option>
              ))}
            </AppSelect>
            <AppButton
              onClick={() => void handleTransferOwnership()}
              disabled={!targetUserId || targetUserId === profile.userId}
              variant="secondary"
            >
              转移给其他用户
            </AppButton>
          </DetailCard>

          <DetailCard title="代理信息">
            <div>proxyType：{profile.proxyType || 'direct'}</div>
            <div>proxyHost：{profile.proxyHost || '-'}</div>
            <div>proxyPort：{profile.proxyPort || '-'}</div>
            <div>expectedProxyIp：{profile.expectedProxyIp || '-'}</div>
          </DetailCard>

          <DetailCard title="指纹信息">
            <div>ua：{profile.ua || '-'}</div>
            <div>seed：{profile.seed || '-'}</div>
            <div>isMobile：{profile.isMobile ? 'true' : 'false'}</div>
          </DetailCard>

          <DetailCard title="启动信息" className="md:col-span-2">
            <div>startupPlatform：{profile.startupPlatform || '-'}</div>
            <div>startupUrl：{profile.startupUrl || '-'}</div>
          </DetailCard>

          <DetailCard title="同步信息" className="md:col-span-2">
            <div>
              syncProfile：
              {syncProfile === 'Ready'
                ? '已就绪'
                : syncProfile === 'Partial'
                ? '部分完成'
                : '未配置'}
            </div>
            <div>storageStateSynced：{profile.storageStateSynced ? '已同步' : '未同步'}</div>
            <div>canonicalSyncVersion：{profile.canonicalSyncVersion ?? 0}</div>
            <div>lastEnvironmentSyncStatus：{profile.lastEnvironmentSyncStatus || '-'}</div>
            <div>lastEnvironmentSyncVersion：{profile.lastEnvironmentSyncVersion ?? 0}</div>
            <div>lastEnvironmentSyncMessage：{profile.lastEnvironmentSyncMessage || '-'}</div>
            <div>lastAutoPushAt：{formatDateTime(profile.lastAutoPushAt)}</div>
            <div>lastAutoPullAt：{formatDateTime(profile.lastAutoPullAt)}</div>
            <div>lastWriterDeviceId：{profile.lastWriterDeviceId || '-'}</div>
            <div>autoSyncTaskCount：{profile.autoSyncTaskCount ?? 0}</div>
            <div>lastAutoSyncError：{profile.lastAutoSyncError || '-'}</div>
          </DetailCard>
        </CardGrid>
      </SectionBlock>
    </div>
  );
}
