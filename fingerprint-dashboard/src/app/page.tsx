'use client'

import React, { useState, useEffect } from 'react'
import {
  LayoutDashboard, Globe, Smartphone, Workflow, Users, Network,
  Puzzle, Bell, Plus, Trash2, Pencil, Play, ShieldCheck, Activity,
  Database, Wifi, WifiOff, ChevronRight, Loader2, X, CheckCircle,
  AlertCircle, MapPin, Zap, Building, User, FingerprintIcon,
  MonitorSmartphone, RefreshCcw, Upload, Settings as SettingsIcon, StopCircle, Command
} from 'lucide-react'
import * as runtime from '@/lib/runtimeClient'

export interface Profile {
  id: string;
  name: string;
  status: string;
  lastActive: string;
  tags: string[];
  proxy?: string;
  ua?: string;
  seed?: string;
  isMobile?: boolean;
  groupId?: string;
  runtimeSessionId?: string;
}

export interface Behavior {
  id: string;
  name: string;
  description?: string;
  actions: any[];
}

export interface Settings {
  runtimeUrl: string;
  runtimeApiKey: string;
}

declare global {
  interface Window { electronAPI: any; }
}

const SidebarItem = ({
  icon: Icon, label, active = false, onClick
}: { icon: React.ElementType, label: string, active?: boolean, onClick: () => void }) => (
  <div
    onClick={onClick}
    className={`flex items-center space-x-3 px-5 py-2.5 mx-2 rounded-lg cursor-pointer transition-all duration-200 group ${
      active
        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
    }`}
  >
    <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
    <span className="font-medium text-sm">{label}</span>
    {active && <ChevronRight size={12} className="ml-auto opacity-50" />}
  </div>
)

const Card = ({ title, children, className = "" }: { title?: string, children: React.ReactNode, className?: string }) => (
  <div className={`glass rounded-xl p-5 ${className}`}>
    {title && <h3 className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-4">{title}</h3>}
    {children}
  </div>
)

const StatCard = ({ title, value, sub, icon: Icon, color }: any) => (
  <Card>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{title}</p>
        <p className="text-3xl font-bold">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{sub}</p>
      </div>
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon size={18} strokeWidth={1.8} />
      </div>
    </div>
  </Card>
)

const EmptyState = ({ icon: Icon, title, desc }: { icon: React.ElementType, title: string, desc: string }) => (
  <div className="flex flex-col items-center justify-center py-24 text-slate-500">
    <div className="p-5 rounded-2xl bg-slate-800/50 mb-5">
      <Icon size={40} strokeWidth={1} className="text-slate-600" />
    </div>
    <h3 className="text-base font-bold text-slate-400 mb-2">{title}</h3>
    <p className="text-sm text-center max-w-xs">{desc}</p>
  </div>
)

export default function Home() {
  const [activeTab, setActiveTab] = useState('浏览器环境')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [proxyChecking, setProxyChecking] = useState(false)
  const [proxyResult, setProxyResult] = useState<any>(null)

  const [proxies, setProxies] = useState([
    { id: '1', host: '45.12.33.1', port: '8080', type: 'HTTP', status: '在线', delay: '120ms', city: '洛杉矶' },
    { id: '2', host: '103.4.1.22', port: '1080', type: 'SOCKS5', status: '在线', delay: '240ms', city: '伦敦' }
  ])
  const [groups, setGroups] = useState<any[]>([])
  
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [groupInput, setGroupInput] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [settings, setSettings] = useState<Settings>({ runtimeUrl: '', runtimeApiKey: '' });
  const [showBehaviorModal, setShowBehaviorModal] = useState(false);
  const [newBehaviorName, setNewBehaviorName] = useState('');
  const [newBehaviorDesc, setNewBehaviorDesc] = useState('');
  const [runtimeOnline, setRuntimeOnline] = useState<boolean | null>(null);
  const [selectedBehavior, setSelectedBehavior] = useState<Behavior | null>(null);
  const [executingBehaviorId, setExecutingBehaviorId] = useState<string | null>(null);
  const [execLogs, setExecLogs] = useState<string[]>([]);
  const [targetSessionId, setTargetSessionId] = useState<string>('');

  const handleSaveGroup = async () => {
    if (!groupInput.trim()) return;
    let upG: any[];
    if (editingGroup) {
      upG = groups.map(g => g.id === editingGroup.id ? { ...g, name: groupInput } : g);
    } else {
      const colors = [
        'bg-green-500/10 text-green-400 border-green-500/20',
        'bg-purple-500/10 text-purple-400 border-purple-500/20',
        'bg-pink-500/10 text-pink-400 border-pink-500/20',
        'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      ];
      upG = [...groups, { 
        id: `group-${Date.now()}`, 
        name: groupInput, 
        color: colors[Math.floor(Math.random() * colors.length)] 
      }];
    }
    setGroups(upG);
    await fetch('/api/groups', { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(upG) });
    setShowGroupModal(false);
    setGroupInput('');
    setEditingGroup(null);
  };
  
  const handleDeleteGroup = async (id: string, e: any) => {
    e.stopPropagation();
    if(confirm('确定要删除这个分组吗？环境将被移至默认分组。')) {
      const upG = groups.filter(g => g.id !== id);
      setGroups(upG);
      await fetch('/api/groups', { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(upG) });
    }
  };

  const openGroupModal = (group?: any) => {
    if (group) {
      setEditingGroup(group);
      setGroupInput(group.name);
    } else {
      setEditingGroup(null);
      setGroupInput('');
    }
    setShowGroupModal(true);
  };

  const fetchProfiles = async () => {
    try {
      const [resP, resG, resB, resS] = await Promise.all([
        fetch('/api/profiles'),
        fetch('/api/groups'),
        fetch('/api/behaviors'),
        fetch('/api/settings')
      ]);
      if (resP.ok) setProfiles(await resP.json())
      if (resG.ok) setGroups(await resG.json())
      if (resB.ok) setBehaviors(await resB.json())
      if (resS.ok) setSettings(await resS.json())
    } catch (err) {
      console.error('获取数据失败', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProfiles() }, [])

  // Poll runtime server status every 5 seconds
  useEffect(() => {
    const checkRuntime = async () => {
      try {
        const res = await fetch('/api/runtime/status');
        if (res.ok) {
          const data = await res.json();
          setRuntimeOnline(data.online === true);
          
          if (data.online && data.sessions) {
            // Synchronize profile statuses with actual runtime sessions
            const activeProfileIds = data.sessions.map((s: any) => s.profileId);
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
          setRuntimeOnline(false);
          setProfiles(prev => prev.map(p => p.status === 'Running' ? { ...p, status: 'Ready' } : p));
        }
      } catch {
        setRuntimeOnline(false);
        setProfiles(prev => prev.map(p => p.status === 'Running' ? { ...p, status: 'Ready' } : p));
      }
    };
    checkRuntime();
    const interval = setInterval(checkRuntime, 5000);
    return () => clearInterval(interval);
  }, [profiles.length])

  const handleCreateProfile = async (isMobile = false, targetGroupId?: string) => {
    try {
      const isMob = activeTab === '手机环境' || isMobile;
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE' })
      if (res.ok) fetchProfiles()
    } catch (err) { console.error('Failed to delete', err) }
  }

  const handleStartSession = async (p: Profile) => {
    try {
      if (runtimeOnline === false) {
        alert('⚠️ Runtime Server 未运行！\n\n请先启动：\n  node stealth-engine/server.js\n\n或使用「日常启动面板」脚本一键启动。');
        return;
      }
      // Pass the full profile object to the runtime server.
      // server.js reads proxy from profile.proxy (URL string like http://user:pass@host:port)
      const res = await runtime.startSession(p, undefined, { headless: false });
      if (res.sessionId) {
        // Update profile in DB with sessionId
        await fetch(`/api/profiles/${p.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...p, runtimeSessionId: res.sessionId, status: 'Running' })
        });
        fetchProfiles();
      }
    } catch (err: any) {
      const msg = err?.error || err?.message || JSON.stringify(err);
      alert('启动失败: ' + msg);
    }
  }

  const handleStopSession = async (p: Profile) => {
    if (!p.runtimeSessionId) return;
    try {
      await runtime.stopSession(p.runtimeSessionId);
      await fetch(`/api/profiles/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, runtimeSessionId: '', status: 'Ready' })
      });
      fetchProfiles();
    } catch (err) {
      console.error('Stop failed', err);
      // Force clear if failed? 
      await fetch(`/api/profiles/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, runtimeSessionId: '', status: 'Ready' })
      });
      fetchProfiles();
    }
  }



  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) alert('设置已保存');
    } catch (err) { console.error(err) }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProfile) return
    try {
      const res = await fetch(`/api/profiles/${editingProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProfile)
      })
      if (res.ok) { setEditingProfile(null); fetchProfiles() }
    } catch (err) { console.error('Failed to update', err) }
  }

  const handleCheckProxy = async () => {
    if (!editingProfile?.proxy) { alert('请先输入代理地址'); return; }
    setProxyChecking(true); setProxyResult(null);
    try {
      const res = await fetch('/api/proxy/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: editingProfile.proxy })
      });
      setProxyResult(await res.json());
    } catch (err) { setProxyResult({ error: '检查失败' }); }
    finally { setProxyChecking(false); }
  }

  // New function for testing individual proxy items in the list
  const [testingProxyId, setTestingProxyId] = useState<string | null>(null);
  const handleTestProxyItem = async (p: any) => {
    setTestingProxyId(p.id);
    try {
      // Format proxy string based on type
      const proxyStr = `${p.type.toLowerCase()}://${p.host}:${p.port}`;
      const res = await fetch('/api/proxy/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: proxyStr })
      });
      const data = await res.json();
      
      // Update proxy list with result
      setProxies(proxies.map(item => {
        if (item.id === p.id) {
          if (data.error) {
            return { ...item, status: '超时', delay: 'N/A' };
          } else {
            return { 
              ...item, 
              status: '在线', 
              delay: `${data.delay}ms`, 
              city: data.city || item.city 
            };
          }
        }
        return item;
      }));
      
      if (data.error) alert(`测试失败: ${data.error}`);
      else alert(`连接成功！延迟: ${data.delay}ms, 位置: ${data.city}`);
      
    } catch (err) {
      alert('代理连接超时');
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
      let type = line.toLowerCase().startsWith('socks') ? 'SOCKS5' : 'HTTP';
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

  const handleCheckAll = () => {
    // 视觉模拟检测全队列
    const updated = proxies.map(p => ({ ...p, status: '检测中...', delay: '-' }));
    setProxies(updated);
    
    setTimeout(() => {
      setProxies(updated.map(p => ({
        ...p,
        status: Math.random() > 0.1 ? '在线' : '严重超时',
        delay: Math.random() > 0.1 ? `${Math.floor(Math.random() * 250 + 50)}ms` : 'N/A',
        city: p.city === '新导入' ? (Math.random() > 0.5 ? '洛杉矶' : '纽约') : p.city
      })));
    }, 2500);
  };

  const handleMockAction = (msg: string) => alert(`「${msg}」功能正在对接中，敬请期待！`)

  const handleCreateBehavior = async () => {
    const name = newBehaviorName.trim() || '未命名流程';
    const newB: Behavior = {
      id: `bh-${Date.now()}`,
      name,
      description: newBehaviorDesc,
      actions: [
        { type: 'goto', url: 'https://www.google.com' }
      ]
    };
    const upB = [...behaviors, newB];
    setBehaviors(upB);
    await fetch('/api/behaviors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(upB) });
    setShowBehaviorModal(false);
    setNewBehaviorName('');
    setNewBehaviorDesc('');
    setSelectedBehavior(newB);
  };

  const handleDeleteBehavior = async (id: string) => {
    if (!confirm('确定删除该流程吗？')) return;
    const upB = behaviors.filter(b => b.id !== id);
    setBehaviors(upB);
    await fetch('/api/behaviors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(upB) });
    if (selectedBehavior?.id === id) setSelectedBehavior(null);
  };

  const handleUpdateBehaviorActions = async (actions: any[]) => {
    if (!selectedBehavior) return;
    const upB = behaviors.map(b => b.id === selectedBehavior.id ? { ...b, actions } : b);
    setBehaviors(upB);
    setSelectedBehavior({ ...selectedBehavior, actions });
    await fetch('/api/behaviors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(upB) });
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
    } catch (err: any) {
      addLog(`❌ 出错: ${err.message || JSON.stringify(err)}`);
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

  const navItems = [
    { icon: LayoutDashboard, label: '控制台' },
    { icon: Globe, label: '浏览器环境' },
    { icon: Smartphone, label: '手机环境' },
    { icon: Workflow, label: '自动化流程' },
    { icon: Users, label: '团队分组' },
    { icon: Network, label: '代理 IP' },
    { icon: Puzzle, label: '扩展程序' },
    { icon: SettingsIcon, label: '系统设置' },
  ]

  return (
    <div className="flex h-screen w-screen bg-[#0c0e14] text-slate-200 overflow-hidden font-sans relative">
      {/* Sidebar */}
      <div className="w-60 flex flex-col border-r border-slate-800/80 bg-[#111318]">
        {/* Logo */}
        <div className="px-5 py-5 flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
            <FingerprintIcon size={16} strokeWidth={2} />
          </div>
          <span className="text-base font-bold tracking-tight">
            军伙工作台<span className="text-blue-500">Core</span>
          </span>
        </div>

        <div className="mx-5 mb-4 h-px bg-slate-800/80" />

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-1">
          {navItems.map(({ icon, label }) => (
            <SidebarItem
              key={label}
              icon={icon}
              label={label}
              active={activeTab === label}
              onClick={() => setActiveTab(label)}
            />
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-slate-800/80">
          <div className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-slate-800/50 cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <User size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">高级版用户</p>
              <p className="text-[10px] text-slate-500">内部授权</p>
            </div>
            <ShieldCheck size={13} className="text-green-500 flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-slate-800/80 bg-[#0f1117]/80 backdrop-blur-sm">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-semibold text-slate-100">{activeTab}</h2>
            {/* Dashboard online indicator */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-bold text-green-500 tracking-wider">面板在线</span>
            </div>
            {/* Runtime server status indicator */}
            <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border ${
              runtimeOnline === true
                ? 'bg-blue-500/10 border-blue-500/20'
                : runtimeOnline === false
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-slate-700/30 border-slate-700'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                runtimeOnline === true ? 'bg-blue-400 animate-pulse' : runtimeOnline === false ? 'bg-red-500' : 'bg-slate-500'
              }`} />
              <span className={`text-[10px] font-bold tracking-wider ${
                runtimeOnline === true ? 'text-blue-400' : runtimeOnline === false ? 'text-red-400' : 'text-slate-500'
              }`}>
                {runtimeOnline === true ? 'Runtime 就绪' : runtimeOnline === false ? 'Runtime 离线' : '检测中...'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleCreateProfile()}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-blue-600/25 active:scale-95"
            >
              <Plus size={13} />
              <span>{activeTab === '手机环境' ? '新建手机环境' : '新建环境'}</span>
            </button>
            <button onClick={() => handleMockAction('通知中心')} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
              <Bell size={15} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#0c0e14]">

          {/* ─── 控制台 ─── */}
          {activeTab === '控制台' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="grid grid-cols-3 gap-4">
                <StatCard 
                  title="活跃环境" 
                  value={activeProfilesCount.toString()} 
                  sub={`共 ${totalProfilesCount} 个环境`} 
                  icon={Globe} 
                  color="bg-blue-500/10 text-blue-400" 
                />
                <StatCard 
                  title="可用代理" 
                  value={onlineProxiesCount.toString()} 
                  sub={`共 ${totalProxiesCount} 个节点`} 
                  icon={Network} 
                  color="bg-purple-500/10 text-purple-400" 
                />
                <StatCard 
                  title="指纹健康度" 
                  value={`${avgHealth}%`} 
                  sub="平均安全得分" 
                  icon={ShieldCheck} 
                  color="bg-green-500/10 text-green-400" 
                />
              </div>
              <Card title="系统活动日志">
                <div className="space-y-3">
                  {[
                    { text: '环境「Facebook#12」已成功启动', time: '刚刚', ok: true },
                    { text: '代理节点 103.4.1.22 心跳检测正常', time: '2 分钟前', ok: true },
                    { text: '环境「TikTok#3」代理连接超时', time: '15 分钟前', ok: false },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center space-x-3 py-2 border-b border-slate-800/50 last:border-0">
                      {item.ok
                        ? <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                        : <AlertCircle size={14} className="text-red-400 flex-shrink-0" />}
                      <span className="text-sm flex-1">{item.text}</span>
                      <span className="text-xs text-slate-500">{item.time}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ─── 浏览器环境 ─── */}
          {activeTab === '浏览器环境' && (
            <div className="animate-in fade-in duration-300">
              <Card title="环境快速管理">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-500 border-b border-slate-800">
                      <tr>
                        <th className="pb-3 font-semibold text-xs">识别 ID</th>
                        <th className="pb-3 font-semibold text-xs">环境名称</th>
                        <th className="pb-3 font-semibold text-xs">代理节点</th>
                        <th className="pb-3 font-semibold text-xs">指纹种子</th>
                        <th className="pb-3 font-semibold text-xs">状态</th>
                        <th className="pb-3 font-semibold text-xs text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {loading ? (
                        <tr><td colSpan={6} className="py-12 text-center">
                          <Loader2 size={20} className="animate-spin text-slate-500 mx-auto" />
                        </td></tr>
                      ) : profiles.filter(p => !p.isMobile).length === 0 ? (
                        <tr><td colSpan={6}>
                          <EmptyState icon={Globe} title="暂无浏览器环境" desc="点击右上角「新建环境」创建您的第一个桌面隔离环境。" />
                        </td></tr>
                      ) : profiles.filter(p => !p.isMobile).map((p) => (
                        <tr key={p.id} className="group hover:bg-slate-800/20 transition-colors">
                          <td className="py-3.5 font-mono text-xs text-slate-500">{p.id.split('-')[0]}</td>
                          <td className="py-3.5 font-medium text-sm flex items-center space-x-2">
                             <MonitorSmartphone size={13} className="text-slate-500" />
                             <span>{p.name}</span>
                          </td>
                          <td className="py-3.5">
                            <div className="flex items-center space-x-1.5">
                              {p.proxy
                                ? <><Wifi size={11} className="text-blue-400" /><span className="font-mono text-xs text-blue-400">{p.proxy}</span></>
                                : <><WifiOff size={11} className="text-slate-500" /><span className="text-xs text-slate-500">本机直连</span></>
                              }
                            </div>
                          </td>
                          <td className="py-3.5 text-xs text-slate-400 font-mono">{p.seed ? p.seed.slice(0, 8) : '—'}</td>
                          <td className="py-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${p.status === 'Running' ? 'bg-green-500/15 text-green-400' : 'bg-slate-700/50 text-slate-400'}`}>
                              {p.status === 'Ready' ? '就绪' : p.status}
                            </span>
                          </td>
                          <td className="py-3.5 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              {p.runtimeSessionId ? (
                                <button
                                  onClick={() => handleStopSession(p)}
                                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-red-600/80 hover:bg-red-600 rounded-md text-xs font-bold transition-colors shadow-sm active:scale-95"
                                >
                                  <StopCircle size={10} /><span>停止</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartSession(p)}
                                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-blue-600/80 hover:bg-blue-600 rounded-md text-xs font-bold transition-colors shadow-sm active:scale-95"
                                >
                                  <Play size={10} /><span>打开</span>
                                </button>
                              )}
                              <button onClick={() => setEditingProfile(p)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => handleDeleteProfile(p.id)} className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ─── 手机环境 ─── */}
          {activeTab === '手机环境' && (
            <div className="animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-base font-bold">手机指纹环境</h3>
                  <p className="text-xs text-slate-500 mt-0.5">模拟 iPhone / Android 设备访问，规避移动端反检测</p>
                </div>
                <button onClick={() => handleCreateProfile(true)} className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-colors active:scale-95 shadow-lg shadow-blue-500/20">
                  <Plus size={13} /><span>新建手机环境</span>
                </button>
              </div>
              <Card title="手机隔离环境">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-500 border-b border-slate-800">
                      <tr>
                        <th className="pb-3 font-semibold text-xs">识别 ID</th>
                        <th className="pb-3 font-semibold text-xs">环境名称</th>
                        <th className="pb-3 font-semibold text-xs">代理节点</th>
                        <th className="pb-3 font-semibold text-xs">指纹种子</th>
                        <th className="pb-3 font-semibold text-xs">状态</th>
                        <th className="pb-3 font-semibold text-xs text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {loading ? (
                        <tr><td colSpan={6} className="py-12 text-center">
                          <Loader2 size={20} className="animate-spin text-slate-500 mx-auto" />
                        </td></tr>
                      ) : profiles.filter(p => !!p.isMobile).length === 0 ? (
                        <tr><td colSpan={6}>
                          <EmptyState icon={Smartphone} title="暂无手机环境" desc="创建专属的移动端指纹环境，骗过任何严苛的反作弊系统。" />
                        </td></tr>
                      ) : profiles.filter(p => !!p.isMobile).map((p) => (
                        <tr key={p.id} className="group hover:bg-slate-800/20 transition-colors">
                          <td className="py-3.5 font-mono text-xs text-slate-500">{p.id.split('-')[0]}</td>
                          <td className="py-3.5 font-medium text-sm flex items-center space-x-2">
                             <Smartphone size={13} className="text-purple-400" />
                             <span className="text-purple-100">{p.name}</span>
                          </td>
                          <td className="py-3.5">
                            <div className="flex items-center space-x-1.5">
                              {p.proxy
                                ? <><Wifi size={11} className="text-blue-400" /><span className="font-mono text-xs text-blue-400">{p.proxy}</span></>
                                : <><WifiOff size={11} className="text-slate-500" /><span className="text-xs text-slate-500">本机直连</span></>
                              }
                            </div>
                          </td>
                          <td className="py-3.5 text-xs text-slate-400 font-mono">{p.seed ? p.seed.slice(0, 8) : '—'}</td>
                          <td className="py-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${p.status === 'Running' ? 'bg-purple-500/15 text-purple-400' : 'bg-slate-700/50 text-slate-400'}`}>
                              {p.status === 'Ready' ? '就绪' : p.status}
                            </span>
                          </td>
                          <td className="py-3.5 text-right flex justify-end space-x-1">
                              {p.runtimeSessionId ? (
                                <button
                                  onClick={() => handleStopSession(p)}
                                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-red-600/80 hover:bg-red-600 rounded-md text-xs font-bold transition-colors shadow-sm active:scale-95"
                                >
                                  <StopCircle size={10} /><span>停止</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartSession(p)}
                                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-blue-600/80 hover:bg-blue-600 rounded-md text-xs font-bold transition-colors shadow-sm active:scale-95"
                                >
                                  <Play size={10} /><span>唤醒真机</span>
                                </button>
                              )}
                            <button onClick={() => setEditingProfile(p)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDeleteProfile(p.id)} className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ─── 团队分组 ─── */}
          {activeTab === '团队分组' && (
            <div className="animate-in fade-in duration-300 space-y-5">
              {!selectedGroupId ? (
                <>
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-base font-bold">团队分组管理</h3>
                      <p className="text-xs text-slate-500 mt-0.5">将环境按业务归类，批量管理更高效</p>
                    </div>
                    <button onClick={() => openGroupModal()} className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-colors active:scale-95 shadow-lg shadow-blue-500/20">
                      <Plus size={13} /><span>新建分组</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {groups.map(g => (
                      <div key={g.id} onClick={() => setSelectedGroupId(g.id)} className="glass rounded-xl p-5 hover:border-slate-500 cursor-pointer transition-all hover:shadow-lg group relative">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`p-2 rounded-lg border ${g.color}`}>
                            <Users size={16} />
                          </div>
                          <div className="flex items-center space-x-2">
                            <button onClick={(e) => { e.stopPropagation(); openGroupModal(g); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-all">
                              <Pencil size={13} />
                            </button>
                            <button onClick={(e) => handleDeleteGroup(g.id, e)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all">
                              <Trash2 size={13} />
                            </button>
                            <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                          </div>
                        </div>
                        <p className="font-bold text-sm">{g.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{profiles.filter(p => p.groupId === g.id).length} 个环境</p>
                      </div>
                    ))}
                    <button
                      onClick={() => openGroupModal()}
                      className="glass rounded-xl p-5 border-2 border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all flex flex-col items-center justify-center space-y-2 min-h-[110px]"
                    >
                      <Plus size={20} strokeWidth={1.5} />
                      <span className="text-xs font-medium">新建自定义分组</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="animate-in slide-in-from-right-2 duration-300">
                  <div className="flex justify-between items-center mb-5">
                    <div className="flex items-center space-x-3">
                      <button onClick={() => setSelectedGroupId(null)} className="flex items-center justify-center w-8 h-8 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
                        <ChevronRight className="rotate-180" size={16} strokeWidth={2.5}/>
                      </button>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-base font-bold">{groups.find(g => g.id === selectedGroupId)?.name}</h3>
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-[10px] font-bold">分组视图</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">管理该分组下的所有隔离环境</p>
                      </div>
                    </div>
                    <button onClick={() => handleCreateProfile(false, selectedGroupId || undefined)} className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-colors shadow-lg shadow-blue-500/20">
                      <Plus size={13} /><span>新建环境入组</span>
                    </button>
                  </div>
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-slate-500 border-b border-slate-800">
                          <tr>
                            <th className="pb-3 font-semibold text-xs">识别 ID</th>
                            <th className="pb-3 font-semibold text-xs">环境名称</th>
                            <th className="pb-3 font-semibold text-xs">代理节点</th>
                            <th className="pb-3 font-semibold text-xs">指纹种子</th>
                            <th className="pb-3 font-semibold text-xs">状态</th>
                            <th className="pb-3 font-semibold text-xs text-right">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {loading ? (
                            <tr><td colSpan={6} className="py-12 text-center">
                              <Loader2 size={20} className="animate-spin text-slate-500 mx-auto" />
                            </td></tr>
                          ) : profiles.filter(p => p.groupId === selectedGroupId).length === 0 ? (
                            <tr><td colSpan={6}>
                              <EmptyState icon={Globe} title="该分组下暂无环境" desc="点击右上角「新建环境入组」开始分配。" />
                            </td></tr>
                          ) : profiles.filter(p => p.groupId === selectedGroupId).map((p) => (
                            <tr key={p.id} className="group hover:bg-slate-800/20 transition-colors">
                              <td className="py-3.5 font-mono text-xs text-slate-500">{p.id.split('-')[0]}</td>
                              <td className="py-3.5 font-medium text-sm flex items-center space-x-2">
                                 {p.isMobile ? <Smartphone size={13} className="text-purple-400" /> : <MonitorSmartphone size={13} className="text-slate-500" />}
                                 <span className={p.isMobile ? "text-purple-100" : ""}>{p.name}</span>
                              </td>
                              <td className="py-3.5">
                                <div className="flex items-center space-x-1.5">
                                  {p.proxy
                                    ? <><Wifi size={11} className="text-blue-400" /><span className="font-mono text-xs text-blue-400">{p.proxy}</span></>
                                    : <><WifiOff size={11} className="text-slate-500" /><span className="text-xs text-slate-500">本机直连</span></>
                                  }
                                </div>
                              </td>
                              <td className="py-3.5 text-xs text-slate-400 font-mono">{p.seed ? p.seed.slice(0, 8) : '—'}</td>
                              <td className="py-3.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${p.status === 'Running' ? (p.isMobile ? 'bg-purple-500/15 text-purple-400':'bg-green-500/15 text-green-400') : 'bg-slate-700/50 text-slate-400'}`}>
                                  {p.status === 'Ready' ? '就绪' : p.status}
                                </span>
                              </td>
                              <td className="py-3.5 text-right flex justify-end space-x-1">
                                {p.runtimeSessionId ? (
                                  <button
                                    onClick={() => handleStopSession(p)}
                                    className="flex items-center space-x-1 px-2.5 py-1.5 bg-red-600/80 hover:bg-red-600 rounded-md text-xs font-bold transition-colors shadow-sm active:scale-95"
                                  >
                                    <StopCircle size={10} /><span>停止</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleStartSession(p)}
                                    className="flex items-center space-x-1 px-2.5 py-1.5 bg-blue-600/80 hover:bg-blue-600 rounded-md text-xs font-bold transition-colors shadow-sm active:scale-95"
                                  >
                                    <Play size={10} /><span>{p.isMobile ? '唤醒真机' : '打开'}</span>
                                  </button>
                                )}
                                <button onClick={() => setEditingProfile(p)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => handleDeleteProfile(p.id)} className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* ─── 系统设置 ─── */}
          {activeTab === '系统设置' && (
            <div className="animate-in fade-in duration-300 max-w-2xl">
              <div className="mb-6">
                <h3 className="text-base font-bold">Runtime 执行引擎设置</h3>
                <p className="text-xs text-slate-500 mt-0.5">配置远程或者本地的 Playwright 执行节点信息</p>
              </div>
              <Card>
                <form onSubmit={handleSaveSettings} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Runtime API URL</label>
                    <input
                      type="text"
                      value={settings.runtimeUrl}
                      onChange={e => setSettings({ ...settings, runtimeUrl: e.target.value })}
                      placeholder="http://127.0.0.1:3001"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Runtime API Key</label>
                    <input
                      type="password"
                      value={settings.runtimeApiKey}
                      onChange={e => setSettings({ ...settings, runtimeApiKey: e.target.value })}
                      placeholder="输入您的安全密钥"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
                    />
                  </div>
                  <div className="pt-2">
                    <button type="submit" className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95">
                      <CheckCircle size={15} />
                      <span>保存配置</span>
                    </button>
                  </div>
                </form>
              </Card>
            </div>
          )}


          {activeTab === '代理 IP' && (
            <div className="animate-in fade-in duration-300 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold">代理节点管理</h3>
                  <p className="text-xs text-slate-500 mt-0.5">统一导入并管理您的代理 IP 池</p>
                </div>
                <div className="flex space-x-2">
                  <button onClick={() => setShowImportModal(true)} className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-colors shadow-lg shadow-blue-500/20">
                    <Upload size={12} /><span>批量导入</span>
                  </button>
                  <button onClick={handleCheckAll} className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold border border-slate-700 transition-colors">
                    <RefreshCcw size={12} /><span>全部检测</span>
                  </button>
                </div>
              </div>
              <Card title="节点列表">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-500 border-b border-slate-800">
                    <tr>
                      <th className="pb-3 text-xs font-semibold">服务器地址</th>
                      <th className="pb-3 text-xs font-semibold">协议</th>
                      <th className="pb-3 text-xs font-semibold">归属地</th>
                      <th className="pb-3 text-xs font-semibold">延迟</th>
                      <th className="pb-3 text-xs font-semibold">状态</th>
                      <th className="pb-3 text-xs text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {proxies.map(p => (
                      <tr key={p.id} className="group hover:bg-slate-800/20 transition-colors">
                        <td className="py-3.5 font-mono text-xs text-blue-400">{p.host}:{p.port}</td>
                        <td className="py-3.5"><span className="px-2 py-0.5 bg-slate-700/60 rounded text-xs font-mono">{p.type}</span></td>
                        <td className="py-3.5 text-sm flex items-center space-x-1.5 pt-4">
                          <MapPin size={11} className="text-slate-500" />
                          <span>{p.city}</span>
                        </td>
                        <td className="py-3.5">
                          <span className="flex items-center space-x-1 text-green-400 text-xs">
                            <Zap size={11} /><span>{p.delay}</span>
                          </span>
                        </td>
                        <td className="py-3.5">
                          <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            p.status === '在线' 
                              ? 'bg-green-500/10 text-green-400' 
                              : 'bg-red-500/10 text-red-400'
                          }`}>
                            {p.status === '在线' && <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
                            <span>{p.status}</span>
                          </span>
                        </td>
                        <td className="py-3.5 text-right flex justify-end space-x-2">
                          <button 
                            onClick={() => handleTestProxyItem(p)}
                            disabled={testingProxyId === p.id}
                            className={`flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors ${
                              testingProxyId === p.id ? 'text-slate-400 cursor-not-allowed' : 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10'
                            }`}
                          >
                            {testingProxyId === p.id ? <Loader2 size={12} className="animate-spin" /> : null}
                            <span>{testingProxyId === p.id ? '测试中' : '测试'}</span>
                          </button>
                          <button 
                            onClick={() => setProxies(proxies.filter(item => item.id !== p.id))}
                            className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}

          {/* ─── 自动化流程 / 扩展程序 ─── */}
          {activeTab === '自动化流程' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
              <div className="flex justify-between items-center mb-5 shrink-0">
                <div>
                  <h3 className="text-base font-bold">自动化流程 (RPA)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">托管点击、填表、登录等自动化脚本</p>
                </div>
                <button 
                  onClick={() => setShowBehaviorModal(true)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-all shadow-lg shadow-blue-500/20"
                >
                  <Plus size={14} />
                  <span>新建流程</span>
                </button>
              </div>

              <div className="flex-1 flex space-x-5 overflow-hidden min-h-0">
                {/* Behavior List Sidebar */}
                <div className="w-64 flex flex-col space-y-3 shrink-0">
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {behaviors.length === 0 ? (
                      <div className="text-center py-10 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
                        <p className="text-xs text-slate-500">暂无流程</p>
                      </div>
                    ) : (
                      behaviors.map(b => (
                        <div 
                          key={b.id}
                          onClick={() => setSelectedBehavior(b)}
                          className={`group p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedBehavior?.id === b.id 
                            ? 'bg-blue-600/10 border-blue-500/40' 
                            : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              <Workflow size={14} className={selectedBehavior?.id === b.id ? 'text-blue-400' : 'text-slate-500'} />
                              <span className="text-xs font-bold truncate max-w-[120px]">{b.name}</span>
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteBehavior(b.id); }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500 line-clamp-1">{b.description || '无描述'}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Editor Content */}
                <div className="flex-1 overflow-hidden flex flex-col min-w-0">
                  {selectedBehavior ? (
                    <div className="h-full flex flex-col space-y-4 overflow-hidden">
                      {/* Control Panel */}
                      <Card className="p-4 shrink-0 bg-slate-900/20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-slate-400">运行目标:</span>
                              <select 
                                value={targetSessionId}
                                onChange={e => setTargetSessionId(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none w-48"
                              >
                                <option value="">选择运行中的环境...</option>
                                {profiles.filter(p => p.status === 'Running').map(p => (
                                  <option key={p.id} value={p.runtimeSessionId}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                            <button 
                              onClick={handleRunBehavior}
                              disabled={!targetSessionId || !!executingBehaviorId}
                              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-bold shadow-lg transition-all ${
                                !targetSessionId || !!executingBehaviorId 
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                                : 'bg-green-600 hover:bg-green-500 text-white shadow-green-500/20'
                              }`}
                            >
                              {executingBehaviorId ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                              <span>{executingBehaviorId ? '正在运行...' : '立即启动'}</span>
                            </button>
                          </div>
                        </div>
                      </Card>

                      <div className="flex-1 flex space-x-4 min-h-0 overflow-hidden">
                        {/* Step Editor */}
                        <div className="flex-1 flex flex-col font-mono text-[11px] bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner shadow-black">
                          <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-slate-800 shrink-0">
                            <span className="text-slate-400 font-sans font-bold">脚本配置 (JSON)</span>
                            <div className="flex space-x-1">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500/20" />
                              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20" />
                              <div className="w-2.5 h-2.5 rounded-full bg-green-500/20" />
                            </div>
                          </div>
                          <textarea 
                            value={JSON.stringify(selectedBehavior.actions, null, 2)}
                            onChange={(e) => {
                              try { 
                                const val = JSON.parse(e.target.value);
                                if(Array.isArray(val)) handleUpdateBehaviorActions(val);
                              } catch(e) {}
                            }}
                            className="flex-1 bg-transparent p-4 outline-none resize-none text-blue-400 custom-scrollbar leading-relaxed"
                            spellCheck={false}
                          />
                        </div>

                        {/* Logs */}
                        <div className="w-72 flex flex-col bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shrink-0">
                          <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-800 font-bold text-[10px] text-slate-400 tracking-wider uppercase shrink-0">
                            执行日志
                          </div>
                          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-[10px] custom-scrollbar">
                            {execLogs.length === 0 ? (
                              <div className="text-slate-600 italic">等待任务运行...</div>
                            ) : (
                              execLogs.map((log, i) => (
                                <div key={i} className={`break-words ${log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : 'text-slate-500'}`}>
                                  {log}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Card className="h-full flex items-center justify-center border-dashed">
                      <div className="text-center space-y-3">
                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto border border-slate-800">
                          <Workflow size={20} className="text-slate-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-400">选择或创建一个流程以开始</p>
                          <p className="text-[11px] text-slate-600 mt-1 max-w-[240px]">通过编写简单的脚本步骤，您可以自动化完成重复性的浏览器操作。</p>
                        </div>
                        <button 
                          onClick={() => setShowBehaviorModal(true)}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold transition-all"
                        >
                          创建第一个流程
                        </button>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === '扩展程序' && (
            <div className="animate-in fade-in duration-300">
              <Card>
                <EmptyState icon={Puzzle} title="扩展程序管理" desc="支持为每个环境独立安装 Chrome 插件，即将上线。" />
              </Card>
            </div>
          )}

        </main>
      </div>

      {/* Edit Modal */}
      {editingProfile && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-[#141720] border border-slate-700/50 rounded-2xl shadow-2xl w-[520px] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Pencil size={15} className="text-blue-400" />
                <h2 className="text-sm font-bold">编辑环境: <span className="text-blue-400">{editingProfile.name}</span></h2>
              </div>
              <button onClick={() => { setEditingProfile(null); setProxyResult(null); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">环境名称</label>
                <input
                  type="text"
                  value={editingProfile.name}
                  onChange={e => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">代理服务器 (HTTP / SOCKS5)</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={editingProfile.proxy || ''}
                    placeholder="例如: http://user:pass@127.0.0.1:8080"
                    onChange={e => { setEditingProfile({ ...editingProfile, proxy: e.target.value }); setProxyResult(null); }}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    disabled={proxyChecking}
                    onClick={handleCheckProxy}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    {proxyChecking ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                    <span>{proxyChecking ? '检测中' : '校验'}</span>
                  </button>
                </div>
                {proxyResult && (
                  <div className={`mt-2 text-[11px] p-3 rounded-lg ${proxyResult.error ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
                    {proxyResult.error ? (
                      <div className="flex items-center space-x-2"><AlertCircle size={12} /><span>{proxyResult.error}</span></div>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="flex items-center space-x-1"><MapPin size={10} /><span>归属地: {proxyResult.country} {proxyResult.city}</span></span>
                        <span className="flex items-center space-x-1"><Database size={10} /><span>IP: {proxyResult.ip}</span></span>
                        <span className="flex items-center space-x-1"><Zap size={10} /><span>延迟: {proxyResult.delay}ms</span></span>
                        <span className="flex items-center space-x-1"><Building size={10} /><span>{proxyResult.isp}</span></span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">自定义 User Agent</label>
                <input
                  type="text"
                  value={editingProfile.ua || ''}
                  placeholder="留空则自动生成"
                  onChange={e => setEditingProfile({ ...editingProfile, ua: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">所属团队分组</label>
                  <select
                    value={editingProfile.groupId || ''}
                    onChange={e => setEditingProfile({ ...editingProfile, groupId: e.target.value || undefined })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors text-slate-200"
                  >
                    <option value="">(无分组)</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">指纹种子 (Seed)</label>
                  <input
                    type="text"
                    value={editingProfile.seed || ''}
                    onChange={e => setEditingProfile({ ...editingProfile, seed: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => { setEditingProfile(null); setProxyResult(null); }} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold border border-slate-700 transition-colors">
                  取消
                </button>
                <button type="submit" className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-colors">
                  <CheckCircle size={14} />
                  <span>保存配置</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Import Modal */}
      {showImportModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-[#141720] border border-slate-700/50 rounded-2xl shadow-2xl w-[520px] overflow-hidden animate-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Upload size={15} className="text-blue-400" />
                <h2 className="text-sm font-bold">批量导入代理 IP</h2>
              </div>
              <button onClick={() => setShowImportModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg flex items-start space-x-2">
                <AlertCircle size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-400 leading-relaxed">
                  系统会自动解析智能区分 IP、端口和账号密码。支持以下格式拼接 (每行一条):<br/>
                  <span className="font-mono text-slate-300">127.0.0.1:1080</span><br/>
                  <span className="font-mono text-slate-300">socks5://45.12.33.1:1080</span><br/>
                  <span className="font-mono text-slate-300">103.4.1.22:9092:user123:mypass</span>
                </div>
              </div>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="在此处狂暴粘贴您的代理列表..."
                className="w-full h-40 bg-slate-900 shadow-inner border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono resize-none text-slate-300"
              />
              <div className="flex justify-end space-x-2 pt-2">
                <button onClick={() => setShowImportModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold border border-slate-700 transition-colors">
                  取消
                </button>
                <button 
                  onClick={handleBatchImport}
                  className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-colors"
                >
                  <CheckCircle size={14} />
                  <span>自动解析并导入</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group Edit Modal */}
      {showGroupModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-[#141720] border border-slate-700/50 rounded-2xl shadow-2xl w-[400px] overflow-hidden animate-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Users size={15} className="text-blue-400" />
                <h2 className="text-sm font-bold">{editingGroup ? '编辑分组' : '新建自定义分组'}</h2>
              </div>
              <button onClick={() => setShowGroupModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">分组名称</label>
                <input
                  type="text"
                  autoFocus
                  value={groupInput}
                  onChange={e => setGroupInput(e.target.value)}
                  placeholder="例如: 东南亚 TikTok 矩阵区"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors text-slate-200"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <button onClick={() => setShowGroupModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold border border-slate-700 transition-colors">
                  取消
                </button>
                <button 
                  onClick={handleSaveGroup}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-colors"
                >
                  <CheckCircle size={14} />
                  <span>保存</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Behavior Modal */}
      {showBehaviorModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-[#141720] border border-slate-700/50 rounded-2xl shadow-2xl w-[420px] overflow-hidden animate-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Workflow size={15} className="text-blue-400" />
                <h2 className="text-sm font-bold">创建自动化流程</h2>
              </div>
              <button onClick={() => setShowBehaviorModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">流程名称</label>
                <input
                  type="text"
                  value={newBehaviorName}
                  onChange={e => setNewBehaviorName(e.target.value)}
                  placeholder="例如: 自动登录 Facebook"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">流程描述 (可选)</label>
                <textarea
                  value={newBehaviorDesc}
                  onChange={e => setNewBehaviorDesc(e.target.value)}
                  placeholder="这个流程是用来做什么的..."
                  className="w-full h-24 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 transition-colors text-slate-300 resize-none"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button onClick={() => setShowBehaviorModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold border border-slate-700 transition-colors">
                  取消
                </button>
                <button 
                  onClick={handleCreateBehavior}
                  className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-colors"
                >
                  <Plus size={14} />
                  <span>立即创建</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
