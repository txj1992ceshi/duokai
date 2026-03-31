'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard, Globe, Smartphone, Workflow, Users, Network,
  Puzzle, Settings as SettingsIcon, ShieldCheck
} from 'lucide-react'
import * as runtime from '@/lib/runtimeClient'
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
import DesktopProfileList from '@/components/DesktopProfileList'
import MobileProfileTable from '@/components/MobileProfileTable'
import GroupProfilesTable from '@/components/GroupProfilesTable'
import RuntimeSettingsPanel from '@/components/RuntimeSettingsPanel'
import {
  getProfileStorageState,
  saveProfileStorageState,
} from '@/lib/profile-storage-state-client'
import { useRouter } from 'next/navigation'
import type { HostEnvironment, ProxyProtocol, ProxyVerificationRecord } from '@/lib/proxyTypes'
import type {
  Behavior,
  BehaviorAction,
  CurrentUserSummary,
  DashboardTab,
  GroupItem,
  Profile,
  ProxyListItem,
  Settings,
} from '@/lib/dashboard-types'
import {
  formatExpectedTarget,
  getCheckStatusLabel,
  getEntryTransportLabel,
  getExpectationMismatchMessage,
  getHostEnvironmentLabel,
} from '@/lib/dashboard-formatters'

type RuntimeSessionSummary = {
  profileId?: string;
};

const RUNTIME_EXECUTION_MODE =
  process.env.NEXT_PUBLIC_RUNTIME_EXECUTION_MODE === 'control-plane'
    ? 'control-plane'
    : 'local';

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
  const [proxyBrowserChecking, setProxyBrowserChecking] = useState(false)
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
  const [settings, setSettings] = useState<Settings>({
    runtimeUrl: '',
    runtimeApiKey: '',
    autoFingerprint: true,
    autoProxyVerification: true,
    defaultStartupPlatform: '',
    defaultStartupUrl: '',
    theme: 'system',
  });
  const [showBehaviorModal, setShowBehaviorModal] = useState(false);
  const [newBehaviorName, setNewBehaviorName] = useState('');
  const [newBehaviorDesc, setNewBehaviorDesc] = useState('');
  const [runtimeOnline, setRuntimeOnline] = useState<boolean | null>(null);
  const runtimeFailureCountRef = useRef(0);
  const [startingProfileIds, setStartingProfileIds] = useState<Record<string, boolean>>({});
  const [selectedBehavior, setSelectedBehavior] = useState<Behavior | null>(null);
  const [executingBehaviorId, setExecutingBehaviorId] = useState<string | null>(null);
  const [execLogs, setExecLogs] = useState<string[]>([]);
  const [targetSessionId, setTargetSessionId] = useState<string>('');
  const [settingsNotice, setSettingsNotice] = useState<{
    message: string;
    variant: 'error' | 'success' | 'info';
  }>({ message: '', variant: 'info' });
  const controlPlaneOnly = RUNTIME_EXECUTION_MODE === 'control-plane';

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
      const [resP, resG, resB, resS] = await Promise.all([
        apiFetch('/api/profiles'),
        apiFetch('/api/groups'),
        apiFetch('/api/behaviors'),
        apiFetch('/api/settings')
      ]);
      if (resP.ok) {
        const payload = await resP.json();
        const rawProfiles = Array.isArray(payload) ? payload : payload?.profiles;
        const mappedProfiles = Array.isArray(rawProfiles) ? rawProfiles.map(toEditableProfile) : [];
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
      if (resS.ok) {
        const settingsPayload = await resS.json();
        const incomingSettings = settingsPayload?.settings ?? settingsPayload;
        setSettings((prev) => ({
          ...prev,
          ...(incomingSettings || {}),
          autoFingerprint:
            typeof incomingSettings?.autoFingerprint === 'boolean'
              ? incomingSettings.autoFingerprint
              : prev.autoFingerprint,
          autoProxyVerification:
            typeof incomingSettings?.autoProxyVerification === 'boolean'
              ? incomingSettings.autoProxyVerification
              : prev.autoProxyVerification,
          defaultStartupPlatform: String(incomingSettings?.defaultStartupPlatform || ''),
          defaultStartupUrl: String(incomingSettings?.defaultStartupUrl || ''),
          theme: String(incomingSettings?.theme || prev.theme || 'system'),
        }));
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

  // Poll runtime server status every 5 seconds
  useEffect(() => {
    const checkRuntime = async () => {
      try {
        const res = await apiFetch('/api/runtime/status');
        if (res.ok) {
          const data = await res.json();
          runtimeFailureCountRef.current = 0;
          setRuntimeOnline(data.online === true);
          
          if (data.online && data.sessions) {
            // Synchronize profile statuses with actual runtime sessions
            const activeProfileIds = (data.sessions as RuntimeSessionSummary[]).map((s) => s.profileId);
            setProfiles(prev => prev.map(p => {
              const isActuallyRunning = activeProfileIds.includes(p.id);
              if (isActuallyRunning && p.status !== 'Running') {
                return { ...p, status: 'Running' };
              }
              if (!isActuallyRunning && p.status === 'Running') {
                return { ...p, status: 'Ready' };
              }
              return p;
            }));
          } else {
            // Runtime offline or no sessions: ensure none are 'Running'
            setProfiles(prev => prev.map(p => p.status === 'Running' ? { ...p, status: 'Ready' } : p));
          }
        } else {
          runtimeFailureCountRef.current += 1;
          if (runtimeFailureCountRef.current >= 2) {
            setRuntimeOnline(false);
          }
          setProfiles(prev => prev.map(p => p.status === 'Running' ? { ...p, status: 'Ready' } : p));
        }
      } catch {
        runtimeFailureCountRef.current += 1;
        if (runtimeFailureCountRef.current >= 2) {
          setRuntimeOnline(false);
          setProfiles(prev => prev.map(p => p.status === 'Running' ? { ...p, status: 'Ready' } : p));
        }
      }
    };
    checkRuntime();
    const interval = setInterval(checkRuntime, 5000);
    return () => clearInterval(interval);
  }, [profiles.length])

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
      // Find if it has a session and stop it
      const p = profiles.find(x => x.id === id);
      if (p?.runtimeSessionId) {
        await runtime.stopSession(p.runtimeSessionId).catch(() => {});
      }
      const res = await apiFetch(`/api/profiles/${id}`, { method: 'DELETE' })
      if (res.ok) fetchProfiles()
    } catch (err) { console.error('Failed to delete', err) }
  }

  const isRunningProfile = useCallback((profile: Profile) => {
    return profile.status === 'Running' || Boolean(profile.runtimeSessionId);
  }, []);

  async function readResponseError(res: Response, fallbackMessage: string) {
    const clone = res.clone();
    const json = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (json) {
      const detail = json.detail && typeof json.detail === 'object'
        ? `\n${JSON.stringify(json.detail)}`
        : '';
      const primary = String(json.error || json.message || fallbackMessage);
      return `${primary}${detail}${res.status ? `\nHTTP ${res.status}` : ''}`;
    }
    const text = await clone.text().catch(() => '');
    return `${fallbackMessage}${text ? `\n${text.slice(0, 500)}` : ''}${res.status ? `\nHTTP ${res.status}` : ''}`;
  }

  const handleStartSession = async (p: Profile) => {
    if (controlPlaneOnly) {
      setStartingProfileIds(prev => ({ ...prev, [p.id]: true }));
      try {
        const res = await apiFetch('/api/control-plane/runtime', {
          method: 'POST',
          body: JSON.stringify({ action: 'start', profileId: p.id }),
        });
        const json = await res.json().catch(() => null) as Record<string, unknown> | null;
        if (!res.ok || json?.success === false) {
          const detail = json && typeof json === 'object'
            ? `${String(json.error || '启动任务下发失败')}${json.detail ? `\n${JSON.stringify(json.detail)}` : ''}${res.status ? `\nHTTP ${res.status}` : ''}`
            : await readResponseError(res, '启动任务下发失败');
          throw new Error(detail);
        }
        setRuntimeOnline(true);
        setProfiles(prev => prev.map(profile => (
          profile.id === p.id
            ? { ...profile, status: 'Running' }
            : profile
        )));
        setTimeout(() => {
          void fetchProfiles();
        }, 1200);
      } catch (err) {
        alert('启动失败: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setStartingProfileIds(prev => {
          const next = { ...prev };
          delete next[p.id];
          return next;
        });
      }
      return;
    }
    setStartingProfileIds(prev => ({ ...prev, [p.id]: true }));
    try {
      if (runtimeOnline === false) {
        const statusRes = await apiFetch('/api/runtime/status').catch(() => null);
        const statusJson = statusRes?.ok ? await statusRes.json() : null;
        if (!statusJson?.online) {
          alert('⚠️ Runtime Server 未运行！\n\n请先启动：\n  node stealth-engine/server.js\n\n或使用「日常启动面板」脚本一键启动。');
          return;
        }
        setRuntimeOnline(true);
        runtimeFailureCountRef.current = 0;
      }
      const res = await runtime.startSession(p, undefined, { headless: false });
      if (res.sessionId) {
        fetchProfiles();
        if (res.startupNavigation?.ok === false) {
          alert(`环境已就绪，但默认平台页打开失败。\n\n目标地址: ${res.startupNavigation.requestedUrl || p.startupUrl || '未指定'}\n错误: ${res.startupNavigation.error || '未知错误'}`);
        }
      }
    } catch (err: unknown) {
      const runtimeError = err as {
        error?: string;
        message?: string;
        hostEnvironment?: HostEnvironment;
        verification?: ProxyVerificationRecord;
      };
      const msg = runtimeError?.verification?.status
        ? `${getCheckStatusLabel(runtimeError.verification.status)}${runtimeError.verification.detail ? `\n${runtimeError.verification.detail}` : ''}${runtimeError.verification.effectiveProxyTransport ? `\n最终入口模式: ${getEntryTransportLabel(runtimeError.verification.effectiveProxyTransport)}` : ''}${runtimeError.hostEnvironment ? `\n宿主环境: ${getHostEnvironmentLabel(runtimeError.hostEnvironment)}` : ''}`
        : (runtimeError?.error || runtimeError?.message || JSON.stringify(runtimeError));
      alert('启动失败: ' + msg);
    } finally {
      setStartingProfileIds(prev => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
    }
  }

  const handleStopSession = async (p: Profile) => {
    if (controlPlaneOnly) {
      try {
        const res = await apiFetch('/api/control-plane/runtime', {
          method: 'POST',
          body: JSON.stringify({ action: 'stop', profileId: p.id }),
        });
        const json = await res.json().catch(() => null) as Record<string, unknown> | null;
        if (!res.ok || json?.success === false) {
          const detail = json && typeof json === 'object'
            ? `${String(json.error || '停止任务下发失败')}${json.detail ? `\n${JSON.stringify(json.detail)}` : ''}${res.status ? `\nHTTP ${res.status}` : ''}`
            : await readResponseError(res, '停止任务下发失败');
          throw new Error(detail);
        }
        setProfiles(prev => prev.map(profile => (
          profile.id === p.id
            ? { ...profile, status: 'Ready', runtimeSessionId: '' }
            : profile
        )));
        setTimeout(() => {
          void fetchProfiles();
        }, 1200);
      } catch (err) {
        alert('停止失败: ' + (err instanceof Error ? err.message : String(err)));
      }
      return;
    }
    if (!p.runtimeSessionId) return;
    try {
      await runtime.stopSession(p.runtimeSessionId);
      fetchProfiles();
    } catch (err) {
      console.error('Stop failed', err);
      await apiFetch(`/api/profiles/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...p, runtimeSessionId: '', status: 'Ready' })
      });
      fetchProfiles();
    }
  }

  const isStartingProfile = (profileId: string) => !!startingProfileIds[profileId];



  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsNotice({ message: '', variant: 'info' });
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          autoFingerprint:
            typeof settings.autoFingerprint === 'boolean'
              ? settings.autoFingerprint
              : true,
          autoProxyVerification:
            typeof settings.autoProxyVerification === 'boolean'
              ? settings.autoProxyVerification
              : true,
          defaultStartupPlatform: String(settings.defaultStartupPlatform || ''),
          defaultStartupUrl: String(settings.defaultStartupUrl || ''),
          theme: String(settings.theme || 'system'),
        })
      });
      if (res.ok) {
        setSettingsNotice({ message: '设置已保存', variant: 'success' });
      } else {
        setSettingsNotice({ message: '设置保存失败', variant: 'error' });
      }
    } catch (err) {
      console.error(err);
      setSettingsNotice({ message: '设置保存失败', variant: 'error' });
    }
  }

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
    if (controlPlaneOnly) {
      setProxyBrowserResult({
        layer: 'environment',
        status: 'unknown',
        browserVerified: false,
        latencyMs: 0,
        error: '云端控制面不提供真实浏览器检测，请在桌面端执行',
        detail: '当前部署模式下，真实浏览器检测和环境启动均应由桌面端本地运行时完成。',
      } as ProxyVerificationRecord);
      return;
    }
    const proxy = buildProxyFromDraft(editingProfile);
    if (!proxy) { alert('请先填写代理类型、主机和端口'); return; }
    setProxyBrowserChecking(true); setProxyBrowserResult(null);
    try {
      const res = await apiFetch('/api/proxy/browser-check', {
        method: 'POST',
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
      const result = await res.json();
      setProxyBrowserResult(result);
      if (result?.country || result?.region || result?.city) {
        setEditingProfile((current) => (
          current
            ? {
                ...current,
                ...deriveExpectedGeoFromVerification(result),
              }
            : current
        ));
      }
    } catch {
      setProxyBrowserResult({ layer: 'environment', status: 'unknown', error: '真实浏览器测试失败' });
    } finally {
      setProxyBrowserChecking(false);
    }
  }

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
      const saved = await getProfileStorageState(profileId);

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

  const addLog = (msg: string) => setExecLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);

  const handleRunBehavior = async () => {
    if (!selectedBehavior || !targetSessionId) {
      alert('请先选择一个流程和运行中的环境');
      return;
    }
    setExecutingBehaviorId(selectedBehavior.id);
    setExecLogs(['--- 启动自动化流程 ---']);
    
    try {
      for (const action of selectedBehavior.actions) {
        addLog(`执行: ${action.type}${action.url ? ` (${action.url})` : ''}${action.selector ? ` [${action.selector}]` : ''}`);
        await runtime.doSessionAction(targetSessionId, action);
        // Random pause between steps
        await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
      }
      addLog('✅ 流程执行完成');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : JSON.stringify(err);
      addLog(`❌ 出错: ${message}`);
    } finally {
      setExecutingBehaviorId(null);
    }
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
            <RuntimeSettingsPanel
              settings={settings}
              noticeMessage={settingsNotice.message}
              noticeVariant={settingsNotice.variant}
              onChange={setSettings}
              onSubmit={handleSaveSettings}
            />
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
        controlPlaneOnly={controlPlaneOnly}
        proxyResult={proxyResult}
        proxyBrowserResult={proxyBrowserResult}
        platformOptions={STARTUP_PLATFORM_OPTIONS}
        onClose={() => { setEditingProfile(null); setProxyResult(null); setProxyBrowserResult(null); }}
        onSubmit={handleSaveProfile}
        onProfileChange={setEditingProfile}
        onCheckProxy={handleCheckProxy}
        onBrowserCheckProxy={handleBrowserCheckProxy}
        onAdoptCurrentProxyResult={handleAdoptCurrentProxyResult}
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
