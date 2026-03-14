'use client'

import React, { useState, useEffect } from 'react'
import {
  LayoutDashboard, Globe, Smartphone, Workflow, Users, Network,
  Puzzle, Bell, Plus, Trash2, Pencil, Play, ShieldCheck, Activity,
  Database, Wifi, WifiOff, ChevronRight, Loader2, X, CheckCircle,
  AlertCircle, MapPin, Zap, Building, User, FingerprintIcon,
  MonitorSmartphone, RefreshCcw, Upload
} from 'lucide-react'

export interface Profile {
  id: string;
  name: string;
  status: string;
  lastActive: string;
  tags: string[];
  proxy?: string;
  ua?: string;
  seed?: string;
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
  const [groups, setGroups] = useState([
    { name: 'Facebook 业务组', count: 8, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    { name: 'Amazon 运营组', count: 12, color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
    { name: '默认分组', count: 3, color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' }
  ])

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/profiles')
      if (res.ok) setProfiles(await res.json())
    } catch (err) {
      console.error('获取环境列表失败', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProfiles() }, [])

  const handleCreateProfile = async () => {
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `新建环境 ${profiles.length + 1}` })
      })
      if (res.ok) fetchProfiles()
    } catch (err) { console.error('Failed to create', err) }
  }

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('确定要删除这个环境吗？这将清除该环境的所有缓存。')) return;
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE' })
      if (res.ok) fetchProfiles()
    } catch (err) { console.error('Failed to delete', err) }
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

  const handleMockAction = (msg: string) => alert(`「${msg}」功能正在对接中，敬请期待！`)

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
            Antigravity<span className="text-blue-500">Core</span>
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
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-bold text-green-500 tracking-wider">在线</span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleCreateProfile}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-blue-600/25 active:scale-95"
            >
              <Plus size={13} />
              <span>新建环境</span>
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
                      ) : profiles.length === 0 ? (
                        <tr><td colSpan={6}>
                          <EmptyState icon={Globe} title="暂无浏览器环境" desc="点击右上角「新建环境」创建您的第一个指纹隔离环境。" />
                        </td></tr>
                      ) : profiles.map((p) => (
                        <tr key={p.id} className="group hover:bg-slate-800/20 transition-colors">
                          <td className="py-3.5 font-mono text-xs text-slate-500">{p.id.split('-')[0]}</td>
                          <td className="py-3.5 font-medium text-sm">{p.name}</td>
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
                          <td className="py-3.5">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await fetch('/api/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: p.id }) });
                                    if (!res.ok) throw new Error('启动失败');
                                  } catch (err) { alert("启动浏览器失败。"); }
                                }}
                                className="flex items-center space-x-1 px-2.5 py-1.5 bg-blue-600/80 hover:bg-blue-600 rounded-md text-xs font-bold transition-colors active:scale-95"
                              >
                                <Play size={10} /><span>打开</span>
                              </button>
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
                <button onClick={() => handleMockAction('新建手机环境')} className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-colors active:scale-95 shadow-lg shadow-blue-500/20">
                  <Plus size={13} /><span>新建手机环境</span>
                </button>
              </div>
              <Card>
                <EmptyState icon={MonitorSmartphone} title="暂无手机环境" desc="点击右上角按钮，创建模拟 iPhone 15 或 Pixel 8 的指纹环境。" />
              </Card>
            </div>
          )}

          {/* ─── 团队分组 ─── */}
          {activeTab === '团队分组' && (
            <div className="animate-in fade-in duration-300 space-y-5">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold">团队分组管理</h3>
                  <p className="text-xs text-slate-500 mt-0.5">将环境按业务归类，批量管理更高效</p>
                </div>
                <button onClick={() => handleMockAction('新建分组')} className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-colors active:scale-95 shadow-lg shadow-blue-500/20">
                  <Plus size={13} /><span>新建分组</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {groups.map(g => (
                  <div key={g.name} className="glass rounded-xl p-5 hover:border-slate-600 cursor-pointer transition-all hover:shadow-lg group">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-2 rounded-lg border ${g.color}`}>
                        <Users size={16} />
                      </div>
                      <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                    </div>
                    <p className="font-bold text-sm">{g.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{g.count} 个环境</p>
                  </div>
                ))}
                <button
                  onClick={() => handleMockAction('新建分组')}
                  className="glass rounded-xl p-5 border-2 border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all flex flex-col items-center justify-center space-y-2 min-h-[110px]"
                >
                  <Plus size={20} strokeWidth={1.5} />
                  <span className="text-xs font-medium">新建分组</span>
                </button>
              </div>
            </div>
          )}

          {/* ─── 代理 IP ─── */}
          {activeTab === '代理 IP' && (
            <div className="animate-in fade-in duration-300 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold">代理节点管理</h3>
                  <p className="text-xs text-slate-500 mt-0.5">统一导入并管理您的代理 IP 池</p>
                </div>
                <div className="flex space-x-2">
                  <button onClick={() => handleMockAction('批量导入代理')} className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-colors shadow-lg shadow-blue-500/20">
                    <Upload size={12} /><span>批量导入</span>
                  </button>
                  <button onClick={() => handleMockAction('全局检测')} className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold border border-slate-700 transition-colors">
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
            <div className="animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-base font-bold">自动化流程 (RPA)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">托管点击、填表、登录等自动化脚本</p>
                </div>
              </div>
              <Card>
                <EmptyState icon={Workflow} title="暂无自动化流程" desc="该功能将支持录制和回放浏览器操作，实现批量自动化，即将上线。" />
              </Card>
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

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">指纹种子 (Seed)</label>
                <input
                  type="text"
                  value={editingProfile.seed || ''}
                  onChange={e => setEditingProfile({ ...editingProfile, seed: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors"
                />
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
    </div>
  )
}
