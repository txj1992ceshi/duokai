'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard, Globe, Smartphone, Workflow, Users, Network,
  Puzzle, Settings as SettingsIcon, ShieldCheck
} from 'lucide-react'
import { apiFetch, getApiBase } from '@/lib/api-client'
import SectionBlock from '@/components/SectionBlock'
import ConsoleOverview from '@/components/ConsoleOverview'
import BatchImportModal from '@/components/BatchImportModal'
import GroupModal from '@/components/GroupModal'
import BehaviorModal from '@/components/BehaviorModal'
import BehaviorWorkspace from '@/components/BehaviorWorkspace'
import EditProfileModal from '@/components/EditProfileModal'
import GroupCardsPanel from '@/components/GroupCardsPanel'
import ProxyListTable from '@/components/ProxyListTable'
import GlassCard from '@/components/GlassCard'
import EmptyState from '@/components/EmptyState'
import DashboardSidebar from '@/components/DashboardSidebar'
import DashboardTopbar from '@/components/DashboardTopbar'
import AdminRuntimeDiagnostics from '@/components/AdminRuntimeDiagnostics'
import DesktopProfileList from '@/components/DesktopProfileList'
import MobileProfileTable from '@/components/MobileProfileTable'
import GroupProfilesTable from '@/components/GroupProfilesTable'
import RuntimeSettingsPanel from '@/components/RuntimeSettingsPanel'
import {
  getProfileStorageState,
  saveProfileStorageState,
} from '@/lib/profile-storage-state-client'
import { listWorkspaceSnapshots } from '@/lib/workspace-snapshot-client'
import { useRouter } from 'next/navigation'
import type { ProxyProtocol, ProxyVerificationRecord } from '@/lib/proxyTypes'
import type {
  AdminAgentHealthSummary,
  AdminAgentTaskSummary,
  AdminTaskFailureSummary,
  AdminTaskEventSummary,
  Behavior,
  BehaviorAction,
  CurrentUserSummary,
  DashboardTab,
  GroupItem,
  IpLeaseSummary,
  PlatformPolicySummary,
  Profile,
  ProxyAssetSummary,
  ProxyListItem,
  WorkspaceSnapshotRecord,
} from '@/lib/dashboard-types'
import {
  formatExpectedTarget,
  getCheckStatusLabel,
  getEntryTransportLabel,
  getExpectationMismatchMessage,
  getHostEnvironmentLabel,
} from '@/lib/dashboard-formatters'

type AdminProxyUsageAsset = ProxyAssetSummary & {
  affectedProfiles?: Array<{ profileId: string; name: string }>;
};

declare global {
  interface Window { electronAPI?: unknown; }
}

const STARTUP_PLATFORM_OPTIONS = [
  { key: 'none', label: '不指定平台', url: '' },
  { key: 'custom', label: '自定义平台', url: '' },
  { key: 'facebook', label: 'facebook.com', url: 'https://www.facebook.com/' },
  { key: 'tiktok', label: 'tiktok.com', url: 'https://www.tiktok.com/' },
  { key: 'instagram', label: 'instagram.com', url: 'https://www.instagram.com/' },
  { key: 'x', label: 'x.com', url: 'https://x.com/' },
  { key: 'whatsapp', label: 'web.whatsapp.com', url: 'https://web.whatsapp.com/' },
  { key: 'line', label: 'line.me', url: 'https://line.me/' },
  { key: 'linkedin', label: 'linkedin.com', url: 'https://www.linkedin.com/' },
  { key: 'linkedin-cn', label: 'linkedin.cn', url: 'https://www.linkedin.cn/' },
  { key: 'youtube', label: 'youtube.com', url: 'https://www.youtube.com/' },
  { key: 'amazon', label: 'amazon.com', url: 'https://www.amazon.com/' },
  { key: 'paypal', label: 'paypal.com', url: 'https://www.paypal.com/' },
  { key: 'gmail', label: 'accounts.google.com', url: 'https://accounts.google.com/' },
  { key: 'google', label: 'google.com', url: 'https://www.google.com/' },
] as const;

function normalizeUrl(url?: string) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function getPlatformUrl(platform?: string) {
  if (!platform || platform === 'none' || platform === 'custom') return '';
  return STARTUP_PLATFORM_OPTIONS.find((item) => item.key === platform)?.url || '';
}

function deriveStartupPlatform(profile: Pick<Profile, 'startupPlatform' | 'startupUrl'>) {
  const explicit = profile.startupPlatform?.trim();
  if (explicit) return explicit;

  const startupUrl = normalizeUrl(profile.startupUrl);
  if (!startupUrl) return 'none';

  const matched = STARTUP_PLATFORM_OPTIONS.find(
    (item) => item.url && normalizeUrl(item.url) === startupUrl
  );
  return matched?.key || 'custom';
}

function parseProxyToDraft(proxy?: string) {
  const emptyDraft = {
    proxyType: 'direct' as ProxyProtocol,
    proxyHost: '',
    proxyPort: '',
    proxyUsername: '',
    proxyPassword: '',
    proxyTypeSource: 'direct' as const,
  };

  if (!proxy) return emptyDraft;

  const raw = proxy.trim();

  try {
    const url = new URL(raw);
    const protocol = url.protocol.replace(':', '');
    return {
      proxyType: (protocol === 'https' || protocol === 'socks5' ? protocol : 'http') as ProxyProtocol,
      proxyHost: url.hostname,
      proxyPort: url.port,
      proxyUsername: decodeURIComponent(url.username || ''),
      proxyPassword: decodeURIComponent(url.password || ''),
      proxyTypeSource: 'explicit' as const,
    };
  } catch {}

  let match = raw.match(/^(https?|socks5):\/\/([^:]+):(\d+):([^:]+):(.+)$/i);
  if (match) {
    const [, protocol, host, port, username, password] = match;
    return {
      proxyType: (protocol === 'https' || protocol === 'socks5' ? protocol : 'http') as ProxyProtocol,
      proxyHost: host,
      proxyPort: port,
      proxyUsername: username,
      proxyPassword: password,
      proxyTypeSource: 'explicit' as const,
    };
  }

  match = raw.match(/^([^:]+):(\d+):([^:]+):(.+)$/);
  if (match) {
    const [, host, port, username, password] = match;
    return {
      proxyType: 'http' as ProxyProtocol,
      proxyHost: host,
      proxyPort: port,
      proxyUsername: username,
      proxyPassword: password,
      proxyTypeSource: 'inferred' as const,
    };
  }

  return emptyDraft;
}

function buildProxyFromDraft(profile: Pick<Profile, 'proxyType' | 'proxyHost' | 'proxyPort' | 'proxyUsername' | 'proxyPassword'>) {
  const host = profile.proxyHost?.trim() || '';
  const port = profile.proxyPort?.trim() || '';
  const username = profile.proxyUsername?.trim() || '';
  const password = profile.proxyPassword?.trim() || '';
  const protocol = profile.proxyType && profile.proxyType !== 'direct' ? profile.proxyType : 'direct';

  if (protocol === 'direct' || !host || !port) return '';

  if (username || password) {
    return `${protocol}://${host}:${port}:${username}:${password}`;
  }

  return `${protocol}://${host}:${port}`;
}

function deriveExpectedGeoFromVerification(verification?: ProxyVerificationRecord | null) {
  if (!verification) {
    return {
      expectedProxyCountry: '',
      expectedProxyRegion: '',
    };
  }

  return {
    expectedProxyCountry: verification.country || '',
    expectedProxyRegion: verification.city || verification.region || '',
  };
}

function toEditableProfile(profile: Profile): Profile {
  const derivedExpectedGeo =
    profile.expectedProxyCountry || profile.expectedProxyRegion
      ? {}
      : deriveExpectedGeoFromVerification(profile.proxyVerification);

  if (profile.proxyType && (profile.proxyHost || profile.proxyPort || profile.proxyType === 'direct')) {
    return {
      ...profile,
      ...derivedExpectedGeo,
      startupPlatform: deriveStartupPlatform(profile),
      startupUrl: profile.startupUrl || getPlatformUrl(deriveStartupPlatform(profile)),
      proxyTypeSource: profile.proxyTypeSource || (profile.proxy ? 'explicit' : 'direct'),
      proxyHost: profile.proxyHost || '',
      proxyPort: profile.proxyPort || '',
      proxyUsername: profile.proxyUsername || '',
      proxyPassword: profile.proxyPassword || '',
    };
  }
  const startupPlatform = deriveStartupPlatform(profile);
  return {
    ...profile,
    ...derivedExpectedGeo,
    ...parseProxyToDraft(profile.proxy),
    startupPlatform,
    startupUrl: profile.startupUrl || getPlatformUrl(startupPlatform),
  };
}

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DashboardTab>('浏览器环境')
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUserSummary>(null);
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [storageStateMap, setStorageStateMap] = useState<Record<string, boolean>>({});
  const [storageStateInput, setStorageStateInput] = useState<Record<string, string>>({});
  const [storageStateEditorOpen, setStorageStateEditorOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [proxyChecking, setProxyChecking] = useState(false)
  const [proxyResult, setProxyResult] = useState<ProxyVerificationRecord | null>(null)
  const proxyBrowserChecking = false
  const [proxyBrowserResult, setProxyBrowserResult] = useState<ProxyVerificationRecord | null>(null)

  const [proxies, setProxies] = useState<ProxyListItem[]>([
    { id: '1', host: '45.12.33.1', port: '8080', type: 'HTTP', status: '未检测', delay: '-', city: '洛杉矶' },
    { id: '2', host: '103.4.1.22', port: '1080', type: 'SOCKS5', status: '未检测', delay: '-', city: '伦敦' }
  ])
  const [groups, setGroups] = useState<GroupItem[]>([])
  
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const [groupInput, setGroupInput] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [showBehaviorModal, setShowBehaviorModal] = useState(false);
  const [newBehaviorName, setNewBehaviorName] = useState('');
  const [newBehaviorDesc, setNewBehaviorDesc] = useState('');
  const [workspaceSnapshotsByProfileId, setWorkspaceSnapshotsByProfileId] = useState<
    Record<string, WorkspaceSnapshotRecord[]>
  >({});
  const [workspaceSnapshotLoadingProfileId, setWorkspaceSnapshotLoadingProfileId] = useState<string | null>(null);
  const [workspaceSnapshotErrorByProfileId, setWorkspaceSnapshotErrorByProfileId] = useState<Record<string, string>>({});
  const [runtimeOnline, setRuntimeOnline] = useState<boolean | null>(null);
  const runtimeFailureCountRef = useRef(0);
  const [startingProfileIds, setStartingProfileIds] = useState<Record<string, boolean>>({});
  const [selectedBehavior, setSelectedBehavior] = useState<Behavior | null>(null);
  const [executingBehaviorId, setExecutingBehaviorId] = useState<string | null>(null);
  const [execLogs, setExecLogs] = useState<string[]>([]);
  const [targetSessionId, setTargetSessionId] = useState<string>('');
  const [adminTaskRows, setAdminTaskRows] = useState<AdminAgentTaskSummary[]>([]);
  const [adminTaskEvents, setAdminTaskEvents] = useState<AdminTaskEventSummary[]>([]);
  const [adminTaskFailures, setAdminTaskFailures] = useState<AdminTaskFailureSummary[]>([]);
  const [adminAgentHealth, setAdminAgentHealth] = useState<AdminAgentHealthSummary[]>([]);
  const [adminProxyUsage, setAdminProxyUsage] = useState<AdminProxyUsageAsset[]>([]);
  const [adminDiagnosticsLoading, setAdminDiagnosticsLoading] = useState(false);
  const [adminDiagnosticsError, setAdminDiagnosticsError] = useState('');
  const [retryingAdminTaskId, setRetryingAdminTaskId] = useState<string | null>(null);

  const readResponseError = useCallback(async (res: Response, fallbackMessage: string) => {
    const text = await res.text().catch(() => '');
    if (text) {
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        const detail = json.detail && typeof json.detail === 'object'
          ? `\n${JSON.stringify(json.detail)}`
          : '';
        const primary = String(json.error || json.message || fallbackMessage);
        return `${primary}${detail}${res.status ? `\nHTTP ${res.status}` : ''}`;
      } catch {
        return `${fallbackMessage}\n${text.slice(0, 500)}${res.status ? `\nHTTP ${res.status}` : ''}`;
      }
    }
    return `${fallbackMessage}${res.status ? `\nHTTP ${res.status}` : ''}`;
  }, []);

  const loadAdminDiagnostics = useCallback(async () => {
    if (currentUser?.role !== 'admin') {
      setAdminTaskRows([]);
      setAdminTaskEvents([]);
      setAdminTaskFailures([]);
      setAdminAgentHealth([]);
      setAdminProxyUsage([]);
      setAdminDiagnosticsError('');
      return;
    }
    setAdminDiagnosticsLoading(true);
    setAdminDiagnosticsError('');
    try {
      const [tasksRes, eventsRes, failuresRes, healthRes, proxyUsageRes] = await Promise.all([
        apiFetch('/api/admin/agents/tasks?limit=12'),
        apiFetch('/api/admin/agents/tasks/events?limit=20'),
        apiFetch('/api/admin/agents/tasks/failures-summary'),
        apiFetch('/api/admin/agents/health-summary'),
        apiFetch('/api/admin/agents/proxy-usage'),
      ]);
      const [tasksData, eventsData, failuresData, healthData, proxyUsageData] = await Promise.all([
        tasksRes.json().catch(() => null),
        eventsRes.json().catch(() => null),
        failuresRes.json().catch(() => null),
        healthRes.json().catch(() => null),
        proxyUsageRes.json().catch(() => null),
      ]);
      if (!tasksRes.ok || !tasksData?.success) {
        throw new Error(tasksData?.error || 'Failed to fetch admin tasks');
      }
      if (!eventsRes.ok || !eventsData?.success) {
        throw new Error(eventsData?.error || 'Failed to fetch admin task events');
      }
      if (!failuresRes.ok || !failuresData?.success) {
        throw new Error(failuresData?.error || 'Failed to fetch failure summary');
      }
      if (!healthRes.ok || !healthData?.success) {
        throw new Error(healthData?.error || 'Failed to fetch agent health summary');
      }
      if (!proxyUsageRes.ok || !proxyUsageData?.success) {
        throw new Error(proxyUsageData?.error || 'Failed to fetch proxy usage');
      }
      setAdminTaskRows(Array.isArray(tasksData.tasks) ? (tasksData.tasks as AdminAgentTaskSummary[]) : []);
      setAdminTaskEvents(Array.isArray(eventsData.events) ? (eventsData.events as AdminTaskEventSummary[]) : []);
      setAdminTaskFailures(
        Array.isArray(failuresData.failures) ? (failuresData.failures as AdminTaskFailureSummary[]) : []
      );
      setAdminAgentHealth(
        Array.isArray(healthData.agents) ? (healthData.agents as AdminAgentHealthSummary[]) : []
      );
      setAdminProxyUsage(
        Array.isArray(proxyUsageData.proxyAssets) ? (proxyUsageData.proxyAssets as AdminProxyUsageAsset[]) : []
      );
    } catch (error) {
      setAdminDiagnosticsError(error instanceof Error ? error.message : 'Failed to fetch admin diagnostics');
    } finally {
      setAdminDiagnosticsLoading(false);
    }
  }, [currentUser?.role]);

  const handleRetryAdminTask = useCallback(
    async (taskId: string) => {
      const normalizedTaskId = String(taskId || '').trim();
      if (!normalizedTaskId) return;
      setRetryingAdminTaskId(normalizedTaskId);
      setAdminDiagnosticsError('');
      try {
        const res = await apiFetch(`/api/admin/agents/tasks/${normalizedTaskId}/retry`, {
          method: 'POST',
        });
        if (!res.ok) {
          throw new Error(await readResponseError(res, '任务重试失败'));
        }
        const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (payload?.success === false) {
          throw new Error(String(payload.error || '任务重试失败'));
        }
        await loadAdminDiagnostics();
      } catch (error) {
        const message = error instanceof Error ? error.message : '任务重试失败';
        setAdminDiagnosticsError(message);
        alert(`任务重试失败: ${message}`);
      } finally {
        setRetryingAdminTaskId(null);
      }
    },
    [loadAdminDiagnostics, readResponseError]
  );

  const loadStorageStateStatus = useCallback(async (items: Array<{ id: string }>) => {
    try {
      const results = await Promise.all(
        items.map(async (profile) => {
          try {
            const data = await getProfileStorageState(profile.id);
            return [profile.id, !!data] as const;
          } catch {
            return [profile.id, false] as const;
          }
        })
      );

      setStorageStateMap(Object.fromEntries(results));
    } catch {
      setStorageStateMap({});
    }
  }, []);

  const loadWorkspaceSnapshots = useCallback(async (profileId: string) => {
    setWorkspaceSnapshotLoadingProfileId(profileId);
    setWorkspaceSnapshotErrorByProfileId((prev) => ({ ...prev, [profileId]: '' }));
    try {
      const snapshots = await listWorkspaceSnapshots(profileId);
      setWorkspaceSnapshotsByProfileId((prev) => ({ ...prev, [profileId]: snapshots }));
    } catch (error) {
      setWorkspaceSnapshotErrorByProfileId((prev) => ({
        ...prev,
        [profileId]:
          error instanceof Error ? error.message : 'Failed to fetch workspace snapshots',
      }));
    } finally {
      setWorkspaceSnapshotLoadingProfileId((current) => (current === profileId ? null : current));
    }
  }, []);

  const handleSaveGroup = async () => {
    if (!groupInput.trim()) return;
    try {
      if (editingGroup?.id) {
        const res = await apiFetch(`/api/groups/${editingGroup.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: groupInput,
            color: editingGroup.color || '',
            notes: editingGroup.notes || '',
          }),
        });
        if (!res.ok) throw new Error('Failed to update group');
      } else {
        const colors = [
          'bg-green-500/10 text-green-400 border-green-500/20',
          'bg-purple-500/10 text-purple-400 border-purple-500/20',
          'bg-pink-500/10 text-pink-400 border-pink-500/20',
          'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const res = await apiFetch('/api/groups', {
          method: 'POST',
          body: JSON.stringify({ name: groupInput, color, notes: '' }),
        });
        if (!res.ok) throw new Error('Failed to create group');
      }

      await fetchProfiles();
      setShowGroupModal(false);
      setGroupInput('');
      setEditingGroup(null);
    } catch (err) {
      console.error('保存分组失败', err);
      alert('保存分组失败');
    }
  };
  
  const handleDeleteGroup = async (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if(confirm('确定要删除这个分组吗？环境将被移至默认分组。')) {
      try {
        const res = await apiFetch(`/api/groups/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete group');
        setGroups((prev) => prev.filter((g) => g.id !== id));
      } catch (err) {
        console.error('删除分组失败', err);
        alert('删除分组失败');
      }
    }
  };

  const openGroupModal = (group?: GroupItem) => {
    if (group) {
      setEditingGroup(group);
      setGroupInput(group.name);
    } else {
      setEditingGroup(null);
      setGroupInput('');
    }
    setShowGroupModal(true);
  };

  const fetchProfiles = useCallback(async () => {
    try {
      const [resP, resG, resB, resProxyAssets, resIpLeases, resPolicies] = await Promise.all([
        apiFetch('/api/profiles'),
        apiFetch('/api/groups'),
        apiFetch('/api/behaviors'),
        apiFetch('/api/proxy-assets'),
        apiFetch('/api/ip-leases'),
        apiFetch('/api/platform-policies'),
      ]);
      const proxyAssetsPayload = resProxyAssets.ok ? await resProxyAssets.json() : null;
      const ipLeasesPayload = resIpLeases.ok ? await resIpLeases.json() : null;
      const policiesPayload = resPolicies.ok ? await resPolicies.json() : null;
      const loadedProxyAssets: ProxyAssetSummary[] = Array.isArray(proxyAssetsPayload?.proxyAssets)
        ? proxyAssetsPayload.proxyAssets
        : [];
      const loadedIpLeases: IpLeaseSummary[] = Array.isArray(ipLeasesPayload?.ipLeases)
        ? ipLeasesPayload.ipLeases
        : [];
      const loadedPolicies: PlatformPolicySummary[] = Array.isArray(policiesPayload?.policies)
        ? policiesPayload.policies
        : [];
      if (resP.ok) {
        const payload = await resP.json();
        const rawProfiles = Array.isArray(payload) ? payload : payload?.profiles;
        const proxyAssetMap = new Map(loadedProxyAssets.map((item) => [item.id, item]));
        const activeLeaseMap = new Map(
          loadedIpLeases.map((item) => [String(item.leaseId || item.id || ''), item])
        );
        const policyMap = new Map(
          loadedPolicies.map((item) => [`${item.platform}:${item.purpose}`, item])
        );
        const mappedProfiles = Array.isArray(rawProfiles)
          ? rawProfiles.map((item) => {
              const editable = toEditableProfile(item as Profile);
              const policy =
                policyMap.get(`${editable.platform || ''}:${editable.purpose || 'operation'}`) || null;
              return {
                ...editable,
                proxyAssetSummary: editable.proxyAssetId ? proxyAssetMap.get(editable.proxyAssetId) || null : null,
                activeLeaseSummary: editable.activeLeaseId ? activeLeaseMap.get(editable.activeLeaseId) || null : null,
                ipUsagePolicy: policy?.proxyPolicy || null,
              };
            })
          : [];
        setProfiles(mappedProfiles);
        loadStorageStateStatus(mappedProfiles);
      }
      if (resG.ok) {
        const groupPayload = await resG.json();
        const rawGroups = Array.isArray(groupPayload)
          ? groupPayload
          : groupPayload?.groups;
        setGroups(Array.isArray(rawGroups) ? rawGroups : []);
      }
      if (resB.ok) {
        const behaviorPayload = await resB.json();
        const rawBehaviors = behaviorPayload?.behaviors ?? behaviorPayload;
        setBehaviors(Array.isArray(rawBehaviors) ? rawBehaviors : []);
      }
    } catch (err) {
      console.error('获取数据失败', err)
    } finally {
      setLoading(false)
    }
  }, [loadStorageStateStatus])

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      router.replace('/login');
      return;
    }

    const userText = localStorage.getItem('user');
    if (userText) {
      try {
        setCurrentUser(JSON.parse(userText));
      } catch {
        localStorage.removeItem('user');
      }
    }

    setAuthChecked(true);
  }, [router]);

  useEffect(() => { void fetchProfiles() }, [fetchProfiles])

  useEffect(() => {
    if (activeTab !== '控制台' || currentUser?.role !== 'admin') {
      return;
    }
    void loadAdminDiagnostics();
  }, [activeTab, currentUser?.role, loadAdminDiagnostics]);

  // Poll canonical control-plane agent status every 5 seconds.
  useEffect(() => {
    const checkRuntime = async () => {
      try {
        const response = await apiFetch('/api/runtime/status');
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          throw new Error(String(data.error || '控制面运行状态读取失败'));
        }
        runtimeFailureCountRef.current = 0;
        setRuntimeOnline(data.online === true);
      } catch {
        runtimeFailureCountRef.current += 1;
        if (runtimeFailureCountRef.current >= 2) {
          setRuntimeOnline(false);
        }
      }
    };
    void checkRuntime();
    const interval = setInterval(() => { void checkRuntime(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateProfile = async (isMobile = false, targetGroupId?: string) => {
    try {
      const isMob = activeTab === '手机环境' || isMobile;
      const res = await apiFetch('/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ 
          name: isMob ? `手机环境 ${profiles.filter(p => p.isMobile).length + 1}` : `桌面环境 ${profiles.filter(p => !p.isMobile).length + 1}`,
          isMobile: isMob,
          groupId: targetGroupId
        })
      })
      if (res.ok) fetchProfiles()
    } catch (err) { console.error('Failed to create', err) }
  }

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('确定要删除这个环境吗？这将清除该环境的所有缓存。')) return;
    try {
      const profile = profiles.find((item) => item.id === id);
      if (profile && (profile.status === 'Running' || Boolean(profile.runtimeSessionId))) {
        const stopResponse = await apiFetch('/api/control-plane/runtime', {
          method: 'POST',
          body: JSON.stringify({ action: 'stop', profileId: profile.id }),
        });
        if (!stopResponse.ok) {
          throw new Error(await readResponseError(stopResponse, '删除前停止任务下发失败'));
        }
      }
      const response = await apiFetch(`/api/profiles/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readResponseError(response, '删除环境失败'));
      }
      await fetchProfiles();
    } catch (error) {
      console.error('Failed to delete', error);
      alert('删除失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const isRunningProfile = useCallback((profile: Profile) => {
    return profile.status === 'Running' || Boolean(profile.runtimeSessionId);
  }, []);

  const handleStartSession = async (profile: Profile) => {
    setStartingProfileIds((previous) => ({ ...previous, [profile.id]: true }));
    try {
      const response = await apiFetch('/api/control-plane/runtime', {
        method: 'POST',
        body: JSON.stringify({ action: 'start', profileId: profile.id }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, '启动任务下发失败'));
      }
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (payload?.success === false) {
        throw new Error(String(payload.error || '启动任务下发失败'));
      }
      setRuntimeOnline(true);
      setProfiles((previous) => previous.map((item) =>
        item.id === profile.id ? { ...item, status: 'Running' } : item
      ));
      setTimeout(() => { void fetchProfiles(); }, 1200);
    } catch (error) {
      alert('启动失败: ' + (error instanceof Error ? error.message : String(error)));
      void fetchProfiles();
    } finally {
      setStartingProfileIds((previous) => {
        const next = { ...previous };
        delete next[profile.id];
        return next;
      });
    }
  };

  const handleStopSession = async (profile: Profile) => {
    try {
      const response = await apiFetch('/api/control-plane/runtime', {
        method: 'POST',
        body: JSON.stringify({ action: 'stop', profileId: profile.id }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, '停止任务下发失败'));
      }
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (payload?.success === false) {
        throw new Error(String(payload.error || '停止任务下发失败'));
      }
      setProfiles((previous) => previous.map((item) =>
        item.id === profile.id ? { ...item, status: 'Ready', runtimeSessionId: '' } : item
      ));
      setTimeout(() => { void fetchProfiles(); }, 1200);
    } catch (error) {
      alert('停止失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const isStartingProfile = (profileId: string) => !!startingProfileIds[profileId];



  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.replace('/login');
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProfile) return
    const proxyType = editingProfile.proxyType;
    const proxyHost = editingProfile.proxyHost;
    const proxyPort = editingProfile.proxyPort;
    const proxyUsername = editingProfile.proxyUsername;
    const proxyPassword = editingProfile.proxyPassword;
    const rest = { ...editingProfile };
    delete rest.proxyType;
    delete rest.proxyHost;
    delete rest.proxyPort;
    delete rest.proxyUsername;
    delete rest.proxyPassword;
    delete rest.proxyTypeSource;
    delete rest.startupPlatform;
    delete rest.startupUrl;
    const startupPlatform = editingProfile.startupPlatform || 'none';
    const startupUrl = startupPlatform === 'custom'
      ? normalizeUrl(editingProfile.startupUrl)
      : getPlatformUrl(startupPlatform);
    const payload = {
      ...rest,
      proxyType: proxyType || 'direct',
      preferredProxyTransport: proxyType || 'direct',
      proxyHost: proxyType === 'direct' ? '' : (proxyHost || ''),
      proxyPort: proxyType === 'direct' ? '' : (proxyPort || ''),
      proxyUsername: proxyType === 'direct' ? '' : (proxyUsername || ''),
      proxyPassword: proxyType === 'direct' ? '' : (proxyPassword || ''),
      proxy: buildProxyFromDraft({ proxyType, proxyHost, proxyPort, proxyUsername, proxyPassword }),
      startupPlatform: startupPlatform === 'none' ? '' : startupPlatform,
      startupUrl: startupUrl || '',
    }
    try {
      const res = await apiFetch(`/api/profiles/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      })
      if (res.ok) { setEditingProfile(null); fetchProfiles() }
    } catch (err) { console.error('Failed to update', err) }
  }

  const handleCheckProxy = async () => {
    if (!editingProfile) return;
    const proxy = buildProxyFromDraft(editingProfile);
    if (!proxy) { alert('请先填写代理类型、主机和端口'); return; }
    setProxyChecking(true); setProxyResult(null);
    try {
      const res = await fetch(`${getApiBase()}/api/proxy/check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proxy,
          proxyType: editingProfile.proxyType,
          proxyHost: editingProfile.proxyHost,
          proxyPort: editingProfile.proxyPort,
          proxyUsername: editingProfile.proxyUsername,
          proxyPassword: editingProfile.proxyPassword,
          expectedIp: editingProfile.expectedProxyIp,
          expectedCountry: editingProfile.expectedProxyCountry,
          expectedRegion: editingProfile.expectedProxyRegion,
        })
      });
      setProxyResult(await res.json());
    } catch { setProxyResult({ layer: 'control', status: 'unknown', error: '网关检测失败' }); }
    finally { setProxyChecking(false); }
  }

  const handleBrowserCheckProxy = async () => {
    if (!editingProfile) return;
    setProxyBrowserResult({
      layer: 'environment',
      status: 'unknown',
      browserVerified: false,
      latencyMs: 0,
      error: '旧直连浏览器检测已退役',
      detail: '真实浏览器检测必须由 CloakBrowser 桌面代理执行；控制面尚未提供对应任务类型，因此本入口保持 fail-closed。',
    } as ProxyVerificationRecord);
  };

  const handleAdoptCurrentProxyResult = () => {
    if (!editingProfile || !proxyBrowserResult?.ip) return;
    setEditingProfile({
      ...editingProfile,
      expectedProxyIp: proxyBrowserResult.ip || '',
      expectedProxyCountry: proxyBrowserResult.country || '',
      expectedProxyRegion: proxyBrowserResult.city || proxyBrowserResult.region || '',
    });
  }

  async function handleSyncLoginState(profileId: string) {
    const raw = storageStateInput[profileId] || '';
    if (!raw.trim()) {
      alert('请先粘贴 storageState JSON');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      alert('storageState JSON 格式无效');
      return;
    }

    try {
      await saveProfileStorageState(profileId, parsed, false);
      const saved = await getProfileStorageState(profileId);
      if (saved) {
        setStorageStateMap((prev) => ({ ...prev, [profileId]: true }));
        alert('登录态已同步');
      } else {
        alert('登录态同步失败');
      }
    } catch {
      alert('登录态同步失败');
    }
  }

  async function handleLoadSyncedLoginState(profileId: string) {
    try {
      const saved = await getProfileStorageState(profileId, { includeContent: true });

      if (!saved?.stateJson) {
        alert('暂无已同步登录态');
        return;
      }

      setStorageStateInput((prev) => ({
        ...prev,
        [profileId]: JSON.stringify(saved.stateJson, null, 2),
      }));

      alert('已加载同步登录态');
    } catch {
      alert('加载已同步登录态失败');
    }
  }

  const openProfileEditor = (profile: Profile) => {
    setEditingProfile(toEditableProfile(profile));
    setProxyResult(null);
    setProxyBrowserResult(profile.proxyVerification || null);
  }

  useEffect(() => {
    if (!editingProfile?.id) {
      return;
    }
    void loadWorkspaceSnapshots(editingProfile.id);
  }, [editingProfile?.id, loadWorkspaceSnapshots]);

  // New function for testing individual proxy items in the list
  const [testingProxyId, setTestingProxyId] = useState<string | null>(null);
  const handleTestProxyItem = async (p: ProxyListItem) => {
    setTestingProxyId(p.id);
    try {
      // Format proxy string based on type
      const proxyStr = `${p.type.toLowerCase()}://${p.host}:${p.port}`;
      const res = await fetch(`${getApiBase()}/api/proxy/check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: proxyStr })
      });
      const data = await res.json();
      
      // Update proxy list with result
      setProxies((prev) => prev.map(item => {
        if (item.id === p.id) {
          if (data.status === 'reachable') {
            return { 
              ...item, 
              status: '网关可达', 
              delay: `${data.latencyMs}ms`, 
              city: data.city || item.city 
            };
          }
          return { ...item, status: getCheckStatusLabel(data.status), delay: `${data.latencyMs ?? 'N/A'}ms` };
        }
        return item;
      }));
      
      if (data.status !== 'reachable') alert(`网关检测失败: ${data.error || getCheckStatusLabel(data.status)}`);
      else alert(`网关可达！延迟: ${data.latencyMs}ms, 位置: ${data.city}`);
      
    } catch {
      alert('网关检测失败');
    } finally {
      setTestingProxyId(null);
    }
  }

  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');

  const handleBatchImport = () => {
    if (!importText.trim()) return;
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
    const newProxies = lines.map((line, index) => {
      const type: ProxyListItem['type'] = line.toLowerCase().startsWith('socks') ? 'SOCKS5' : 'HTTP';
      let host = '未知IP';
      let port = '80';
      
      // Simple Regex to extract IP and Port for display
      const ipMatch = line.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/);
      if (ipMatch) host = ipMatch[0];
      
      // Look for port numbers right after colon
      const portMatch = line.match(/:(\d{2,5})/g);
      if (portMatch && portMatch.length > 0) {
        port = portMatch[0].replace(':', '');
      }

      return {
        id: `import-${Date.now()}-${index}`,
        host,
        port,
        type,
        status: '未检测',
        delay: '-',
        city: '新导入'
      };
    });
    
    setProxies([...newProxies, ...proxies]);
    setShowImportModal(false);
    setImportText('');
  };

  const handleCheckAll = async () => {
    const updated = proxies.map(p => ({ ...p, status: '检测中...', delay: '-' }));
    setProxies(updated);

    const next = [...updated];
    for (const proxy of next) {
      const proxyStr = `${proxy.type.toLowerCase()}://${proxy.host}:${proxy.port}`;
      try {
        const res = await fetch(`${getApiBase()}/api/proxy/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proxy: proxyStr })
        });
        const data = await res.json();
        const index = next.findIndex(item => item.id === proxy.id);
        if (index !== -1) {
          next[index] = {
            ...next[index],
            status: data.status === 'reachable' ? '网关可达' : getCheckStatusLabel(data.status),
            delay: `${data.latencyMs ?? 'N/A'}ms`,
            city: data.city || next[index].city,
          };
          setProxies([...next]);
        }
      } catch {
        const index = next.findIndex(item => item.id === proxy.id);
        if (index !== -1) {
          next[index] = { ...next[index], status: '网关检测失败', delay: 'N/A' };
          setProxies([...next]);
        }
      }
    }
  };

  const handleMockAction = (msg: string) => alert(`「${msg}」功能正在对接中，敬请期待！`)

  const handleCreateBehavior = async () => {
    const name = newBehaviorName.trim() || '未命名流程';
    try {
      const res = await apiFetch('/api/behaviors', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: newBehaviorDesc,
          enabled: true,
          actions: [{ type: 'goto', url: 'https://www.google.com' }],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.behavior) {
        throw new Error(data?.error || 'Failed to create behavior');
      }

      const createdBehavior = data.behavior as Behavior;
      setBehaviors((prev) => [createdBehavior, ...prev]);
      setShowBehaviorModal(false);
      setNewBehaviorName('');
      setNewBehaviorDesc('');
      setSelectedBehavior(createdBehavior);
    } catch (err) {
      console.error('创建流程失败', err);
      alert('创建流程失败');
    }
  };

  const handleDeleteBehavior = async (id: string) => {
    if (!confirm('确定删除该流程吗？')) return;
    try {
      const res = await apiFetch(`/api/behaviors/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete behavior');
      }
      setBehaviors((prev) => prev.filter((b) => b.id !== id));
      if (selectedBehavior?.id === id) setSelectedBehavior(null);
    } catch (err) {
      console.error('删除流程失败', err);
      alert('删除流程失败');
    }
  };

  const handleUpdateBehaviorActions = async (actions: BehaviorAction[]) => {
    if (!selectedBehavior) return;
    const targetBehavior = behaviors.find((b) => b.id === selectedBehavior.id) || selectedBehavior;
    try {
      const res = await apiFetch(`/api/behaviors/${selectedBehavior.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: targetBehavior.name,
          description: targetBehavior.description || '',
          enabled: typeof targetBehavior.enabled === 'boolean' ? targetBehavior.enabled : true,
          actions,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.behavior) {
        throw new Error(data?.error || 'Failed to update behavior');
      }

      const updatedBehavior = data.behavior as Behavior;
      setBehaviors((prev) => prev.map((b) => (b.id === selectedBehavior.id ? updatedBehavior : b)));
      setSelectedBehavior(updatedBehavior);
    } catch (err) {
      console.error('更新流程动作失败', err);
      alert('更新流程动作失败');
    }
  };

  const handleRunBehavior = async () => {
    setExecutingBehaviorId(null);
    setExecLogs([
      `[${new Date().toLocaleTimeString()}] 旧直连脚本执行入口已退役；当前仅支持控制面 start/stop 任务。`,
    ]);
    alert('自动化动作直连 Runtime 已退役，未执行任何浏览器动作。');
  };

  // --- Dynamic Stats Calculations ---
  const activeProfilesCount = profiles.filter(p => p.status === 'Running').length;
  const totalProfilesCount = profiles.length;

  const onlineProxiesCount = proxies.filter(p => String(p.status).includes('在线')).length;
  const totalProxiesCount = proxies.length;

  const calculateHealth = () => {
    if (profiles.length === 0) return 100;
    let totalScore = 0;
    profiles.forEach(p => {
      let score = 60; // Base score (isolation enabled)
      if (p.proxy) score += 20; // Having a proxy increases health
      if (p.ua) score += 10;    // Custom UA increases health
      if (p.seed) score += 10;  // Deterministic seed increases health
      totalScore += score;
    });
    return Math.round(totalScore / profiles.length);
  };
  const avgHealth = calculateHealth();

  const navItems: Array<{ icon: React.ElementType; label: DashboardTab }> = [
    { icon: LayoutDashboard, label: '控制台' },
    { icon: Globe, label: '浏览器环境' },
    { icon: Smartphone, label: '手机环境' },
    { icon: Workflow, label: '自动化流程' },
    { icon: Users, label: '团队分组' },
    { icon: Network, label: '代理 IP' },
    { icon: Puzzle, label: '扩展程序' },
    { icon: SettingsIcon, label: '系统设置' },
  ]

  if (!authChecked) {
    return null;
  }

  return (
    <div className="flex h-screen w-screen bg-[#0c0e14] text-slate-200 overflow-hidden font-sans relative">
      <DashboardSidebar
        activeTab={activeTab}
        navItems={navItems}
        currentUser={currentUser}
        onChangeTab={setActiveTab}
      />

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopbar
          activeTab={activeTab}
          runtimeOnline={runtimeOnline}
          currentUser={currentUser}
          onOpenAdminUsers={() => router.push('/admin/users')}
          onLogout={handleLogout}
          onCreateProfile={() => handleCreateProfile(activeTab === '手机环境')}
          onNotify={() => handleMockAction('通知中心')}
        />

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#0c0e14]">

          {/* ─── 控制台 ─── */}
          {activeTab === '控制台' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <ConsoleOverview
                stats={[
                  {
                    title: '活跃环境',
                    value: activeProfilesCount.toString(),
                    sub: `共 ${totalProfilesCount} 个环境`,
                    icon: Globe,
                    color: 'bg-blue-500/10 text-blue-400',
                  },
                  {
                    title: '可用代理',
                    value: onlineProxiesCount.toString(),
                    sub: `共 ${totalProxiesCount} 个节点`,
                    icon: Network,
                    color: 'bg-purple-500/10 text-purple-400',
                  },
                  {
                    title: '指纹健康度',
                    value: `${avgHealth}%`,
                    sub: '平均安全得分',
                    icon: ShieldCheck,
                    color: 'bg-green-500/10 text-green-400',
                  },
                ]}
                activities={[
                  { text: '环境「Facebook#12」已成功启动', time: '刚刚', ok: true },
                  { text: '代理节点 103.4.1.22 心跳检测正常', time: '2 分钟前', ok: true },
                  { text: '环境「TikTok#3」代理连接超时', time: '15 分钟前', ok: false },
                ]}
              />
              {currentUser?.role === 'admin' ? (
                <AdminRuntimeDiagnostics
                  loading={adminDiagnosticsLoading}
                  error={adminDiagnosticsError}
                  tasks={adminTaskRows}
                  events={adminTaskEvents}
                  failures={adminTaskFailures}
                  agents={adminAgentHealth}
                  proxyAssets={adminProxyUsage}
                  retryingTaskId={retryingAdminTaskId}
                  onRetryTask={handleRetryAdminTask}
                />
              ) : null}
            </div>
          )}

          {/* ─── 浏览器环境 ─── */}
          {activeTab === '浏览器环境' && (
            <div className="animate-in fade-in duration-300">
              <SectionBlock
                title="浏览器环境"
                description="统一查看桌面环境、代理节点、指纹摘要与平台状态。"
              >
              <DesktopProfileList
                loading={loading}
                profiles={profiles.filter((p) => !p.isMobile)}
                storageStateMap={storageStateMap}
                storageStateInput={storageStateInput}
                storageStateEditorOpen={storageStateEditorOpen}
                isStartingProfile={isStartingProfile}
                isRunningProfile={isRunningProfile}
                onStartSession={handleStartSession}
                onStopSession={handleStopSession}
                onEditProfile={openProfileEditor}
                onDeleteProfile={handleDeleteProfile}
                onToggleStorageStateEditor={(profileId) =>
                  setStorageStateEditorOpen((prev) => ({ ...prev, [profileId]: !prev[profileId] }))
                }
                onChangeStorageStateInput={(profileId, value) =>
                  setStorageStateInput((prev) => ({ ...prev, [profileId]: value }))
                }
                onSyncLoginState={handleSyncLoginState}
                onLoadSyncedLoginState={handleLoadSyncedLoginState}
              />
              </SectionBlock>
            </div>
          )}

          {/* ─── 手机环境 ─── */}
          {activeTab === '手机环境' && (
            <div className="animate-in fade-in duration-300">
              <MobileProfileTable
                loading={loading}
                profiles={profiles.filter((p) => !!p.isMobile)}
                storageStateMap={storageStateMap}
                storageStateInput={storageStateInput}
                storageStateEditorOpen={storageStateEditorOpen}
                isStartingProfile={isStartingProfile}
                isRunningProfile={isRunningProfile}
                onStartSession={handleStartSession}
                onStopSession={handleStopSession}
                onEditProfile={openProfileEditor}
                onDeleteProfile={handleDeleteProfile}
                onToggleStorageStateEditor={(profileId) =>
                  setStorageStateEditorOpen((prev) => ({ ...prev, [profileId]: !prev[profileId] }))
                }
                onChangeStorageStateInput={(profileId, value) =>
                  setStorageStateInput((prev) => ({ ...prev, [profileId]: value }))
                }
                onSyncLoginState={handleSyncLoginState}
                onLoadSyncedLoginState={handleLoadSyncedLoginState}
              />
            </div>
          )}

          {/* ─── 团队分组 ─── */}
          {activeTab === '团队分组' && (
            <div className="animate-in fade-in duration-300 space-y-5">
              {!selectedGroupId ? (
                <GroupCardsPanel
                  groups={groups}
                  profiles={profiles}
                  onSelectGroup={setSelectedGroupId}
                  onCreateGroup={() => openGroupModal()}
                  onEditGroup={openGroupModal}
                  onDeleteGroup={handleDeleteGroup}
                />
              ) : (
                <GroupProfilesTable
                  loading={loading}
                  selectedGroup={groups.find((g) => g.id === selectedGroupId) || null}
                  profiles={profiles.filter((p) => p.groupId === selectedGroupId)}
                  storageStateMap={storageStateMap}
                  storageStateInput={storageStateInput}
                  storageStateEditorOpen={storageStateEditorOpen}
                  isStartingProfile={isStartingProfile}
                  isRunningProfile={isRunningProfile}
                  onBack={() => setSelectedGroupId(null)}
                  onCreateProfile={() => handleCreateProfile(false, selectedGroupId || undefined)}
                  onStartSession={handleStartSession}
                  onStopSession={handleStopSession}
                  onEditProfile={openProfileEditor}
                  onDeleteProfile={handleDeleteProfile}
                  onToggleStorageStateEditor={(profileId) =>
                    setStorageStateEditorOpen((prev) => ({ ...prev, [profileId]: !prev[profileId] }))
                  }
                  onChangeStorageStateInput={(profileId, value) =>
                    setStorageStateInput((prev) => ({ ...prev, [profileId]: value }))
                  }
                  onSyncLoginState={handleSyncLoginState}
                  onLoadSyncedLoginState={handleLoadSyncedLoginState}
                />
              )}
            </div>
          )}

          {/* ─── 系统设置 ─── */}
          {activeTab === '系统设置' && (
            <RuntimeSettingsPanel />
          )}


          {activeTab === '代理 IP' && (
            <ProxyListTable
              proxies={proxies}
              testingProxyId={testingProxyId}
              onImport={() => setShowImportModal(true)}
              onCheckAll={handleCheckAll}
              onTestProxy={handleTestProxyItem}
              onDeleteProxy={(proxyId) =>
                setProxies(proxies.filter((item) => item.id !== proxyId))
              }
            />
          )}

          {/* ─── 自动化流程 / 扩展程序 ─── */}
          {activeTab === '自动化流程' && (
            <BehaviorWorkspace
              behaviors={behaviors}
              selectedBehavior={selectedBehavior}
              profiles={profiles}
              targetSessionId={targetSessionId}
              executingBehaviorId={executingBehaviorId}
              execLogs={execLogs}
              onSelectBehavior={setSelectedBehavior}
              onDeleteBehavior={handleDeleteBehavior}
              onTargetSessionChange={setTargetSessionId}
              onRunBehavior={handleRunBehavior}
              onOpenCreate={() => setShowBehaviorModal(true)}
              onUpdateActions={handleUpdateBehaviorActions}
            />
          )}

          {activeTab === '扩展程序' && (
            <div className="animate-in fade-in duration-300">
              <GlassCard>
                <EmptyState icon={Puzzle} title="扩展程序管理" desc="支持为每个环境独立安装 Chrome 插件，即将上线。" />
              </GlassCard>
            </div>
          )}

        </main>
      </div>

      <EditProfileModal
        profile={editingProfile}
        groups={groups}
        proxyChecking={proxyChecking}
        proxyBrowserChecking={proxyBrowserChecking}
        controlPlaneOnly={true}
        proxyResult={proxyResult}
        proxyBrowserResult={proxyBrowserResult}
        workspaceSnapshots={editingProfile ? (workspaceSnapshotsByProfileId[editingProfile.id] || []) : []}
        workspaceSnapshotsLoading={editingProfile ? workspaceSnapshotLoadingProfileId === editingProfile.id : false}
        workspaceSnapshotsError={editingProfile ? (workspaceSnapshotErrorByProfileId[editingProfile.id] || '') : ''}
        platformOptions={STARTUP_PLATFORM_OPTIONS}
        onClose={() => { setEditingProfile(null); setProxyResult(null); setProxyBrowserResult(null); }}
        onSubmit={handleSaveProfile}
        onProfileChange={setEditingProfile}
        onCheckProxy={handleCheckProxy}
        onBrowserCheckProxy={handleBrowserCheckProxy}
        onAdoptCurrentProxyResult={handleAdoptCurrentProxyResult}
        onRefreshWorkspaceSnapshots={() => {
          if (editingProfile?.id) {
            void loadWorkspaceSnapshots(editingProfile.id);
          }
        }}
        getPlatformUrl={getPlatformUrl}
        buildProxyFromDraft={buildProxyFromDraft}
        formatExpectedTarget={formatExpectedTarget}
        getHostEnvironmentLabel={getHostEnvironmentLabel}
        getCheckStatusLabel={getCheckStatusLabel}
        getEntryTransportLabel={getEntryTransportLabel}
        getExpectationMismatchMessage={getExpectationMismatchMessage}
      />

      {/* Batch Import Modal */}
      <BatchImportModal
        open={showImportModal}
        value={importText}
        onChange={setImportText}
        onClose={() => setShowImportModal(false)}
        onImport={handleBatchImport}
      />

      {/* Group Edit Modal */}
      <GroupModal
        open={showGroupModal}
        isEditing={!!editingGroup}
        value={groupInput}
        onChange={setGroupInput}
        onClose={() => setShowGroupModal(false)}
        onSave={handleSaveGroup}
      />

      {/* Behavior Modal */}
      <BehaviorModal
        open={showBehaviorModal}
        name={newBehaviorName}
        description={newBehaviorDesc}
        onNameChange={setNewBehaviorName}
        onDescriptionChange={setNewBehaviorDesc}
        onClose={() => setShowBehaviorModal(false)}
        onCreate={handleCreateBehavior}
      />

    </div>
  )
}
