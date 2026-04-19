'use client'

import { startTransition, useMemo, useState, useEffect } from 'react'
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetOverlay,
  SheetTitle,
} from '@duokai/ui'
import {
  BellDot,
  Boxes,
  Download,
  Gauge,
  Globe,
  LayoutGrid,
  Logs,
  MessageSquare,
  PhoneCall,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Smartphone,
  Sparkles,
  Square,
  UserCircle2,
  Video,
} from 'lucide-react'
import {
  consolePages,
  initialAccount,
  initialBulkTasks,
  initialCloudPhones,
  initialDeviceStatus,
  initialEnvironments,
  initialLogs,
  initialMessageAssistActions,
  initialMessageChannels,
  initialMessageContacts,
  initialMessageThreads,
  initialProxies,
  initialSettings,
  type BulkTask,
  type CloudPhoneItem,
  type ConsolePageKey,
  type EnvironmentItem,
  type MessageChannelKey,
  type MessageRecord,
  type TaskLog,
} from '@/lib/mock-data'

type EnvironmentFormState = {
  id?: string
  name: string
  groupName: string
  purpose: EnvironmentItem['purpose']
  platform: string
  proxyLabel: string
}

type CloudPhoneFormState = {
  id?: string
  name: string
  provider: string
  region: string
}

const pageMeta: Record<ConsolePageKey, { title: string; subtitle: string }> = {
  dashboard: {
    title: '数据总览首页',
    subtitle: '围绕本地执行器、环境运行状态和聚合消息群控概览构建新的双核心控制台。',
  },
  messageControl: {
    title: '聚合消息群控',
    subtitle: '统一承载 TikTok / WhatsApp / Telegram 等渠道的会话、AI 辅助回复与运营协作。',
  },
  environment: {
    title: 'Environment Matrix',
    subtitle: '浏览器环境列表、创建/编辑抽屉、筛选与批量操作全部在同一屏完成。',
  },
  cloudPhones: {
    title: '手机环境(安卓)',
    subtitle: '云手机环境继续保留在首期前台中，并统一到新的矩阵控制台视觉语言里。',
  },
  proxy: {
    title: '专业代理 IP 模块',
    subtitle: '代理节点健康、时延测试与基础编辑能力继续作为核心工作区存在。',
  },
  logs: {
    title: '运行状态与诊断',
    subtitle: '集中查看本地执行器心跳、消息桥接状态、任务日志与失败反馈。',
  },
  settings: {
    title: '全局系统设置',
    subtitle: '控制面基础配置、默认设备与全局开关汇总到统一设置页。',
  },
  account: {
    title: '账号与设备',
    subtitle: '当前账号、设备绑定、本地执行器下载入口和消息接入节点状态都在这里查看。',
  },
  notice: {
    title: '通知中心',
    subtitle: '告警和跨设备通知将在后续阶段接入，这里先保留产品入口位。',
  },
}

function badgeToneForStatus(status: EnvironmentItem['status']) {
  if (status === 'running') return 'success'
  if (status === 'starting') return 'primary'
  if (status === 'error') return 'danger'
  return 'neutral'
}

function syncTone(syncStatus: EnvironmentItem['syncStatus']) {
  if (syncStatus === 'synced') return 'success'
  if (syncStatus === 'pending') return 'warning'
  return 'danger'
}

function logTone(level: TaskLog['level']) {
  if (level === 'success') return 'success'
  if (level === 'warning') return 'warning'
  if (level === 'error') return 'danger'
  return 'primary'
}

function bulkTaskTone(status: BulkTask['status']) {
  if (status === 'success') return 'success'
  if (status === 'running' || status === 'queued') return 'primary'
  if (status === 'partial_failure') return 'warning'
  return 'danger'
}

function channelTone(channel: Exclude<MessageChannelKey, 'all'>) {
  if (channel === 'tiktok') return 'bg-sky-500/14 text-sky-300'
  if (channel === 'whatsapp') return 'bg-emerald-500/14 text-emerald-300'
  if (channel === 'telegram') return 'bg-cyan-500/14 text-cyan-300'
  return 'bg-fuchsia-500/14 text-fuchsia-300'
}

export function WebConsoleApp() {
  const [activePage, setActivePage] = useState<ConsolePageKey>('dashboard')
  const [deviceStatus] = useState(initialDeviceStatus)
  const [environments, setEnvironments] = useState(initialEnvironments)
  const [cloudPhones, setCloudPhones] = useState(initialCloudPhones)
  const [proxies] = useState(initialProxies)
  const [logs, setLogs] = useState(initialLogs)
  const [bulkTasks, setBulkTasks] = useState(initialBulkTasks)
  const [settings, setSettings] = useState(initialSettings)
  const [account] = useState(initialAccount)
  const [messageChannels] = useState(initialMessageChannels)
  const [messageContacts] = useState(initialMessageContacts)
  const [messageThreads, setMessageThreads] = useState(initialMessageThreads)
  const [messageAssistActions] = useState(initialMessageAssistActions)
  const [selectedChannel, setSelectedChannel] = useState<MessageChannelKey>('all')
  const [selectedContactId, setSelectedContactId] = useState(initialMessageContacts[0]?.id ?? '')
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [draftMessage, setDraftMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] = useState<string[]>([])
  const [environmentDrawerOpen, setEnvironmentDrawerOpen] = useState(false)
  const [cloudPhoneDrawerOpen, setCloudPhoneDrawerOpen] = useState(false)
  const [environmentForm, setEnvironmentForm] = useState<EnvironmentFormState>({
    name: '',
    groupName: 'TikTok Operation',
    purpose: 'operation',
    platform: 'Windows 11 / Chrome 124',
    proxyLabel: initialProxies[0]?.endpoint ?? '',
  })
  const [cloudPhoneForm, setCloudPhoneForm] = useState<CloudPhoneFormState>({
    name: '',
    provider: 'Self-hosted',
    region: 'SG',
  })
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null)
  const [editingCloudPhoneId, setEditingCloudPhoneId] = useState<string | null>(null)

  const groupOptions = useMemo(
    () => ['all', ...Array.from(new Set(environments.map((item) => item.groupName)))],
    [environments],
  )

  const filteredEnvironments = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase()
    return environments.filter((item) => {
      const matchesSearch =
        normalized.length === 0 ||
        item.name.toLowerCase().includes(normalized) ||
        item.platform.toLowerCase().includes(normalized) ||
        item.proxyLabel.toLowerCase().includes(normalized)
      const matchesGroup = groupFilter === 'all' || item.groupName === groupFilter
      return matchesSearch && matchesGroup
    })
  }, [environments, groupFilter, searchQuery])

  const groupedEnvironmentCounts = useMemo(
    () =>
      filteredEnvironments.reduce<Record<string, number>>((acc, item) => {
        acc[item.groupName] = (acc[item.groupName] ?? 0) + 1
        return acc
      }, {}),
    [filteredEnvironments],
  )

  const filteredContacts = useMemo(() => {
    const normalized = messageSearchQuery.trim().toLowerCase()
    return messageContacts.filter((contact) => {
      const matchesChannel = selectedChannel === 'all' || contact.channel === selectedChannel
      const matchesSearch =
        normalized.length === 0 ||
        contact.name.toLowerCase().includes(normalized) ||
        contact.lastMessage.toLowerCase().includes(normalized)
      return matchesChannel && matchesSearch
    })
  }, [messageContacts, messageSearchQuery, selectedChannel])

  const activeContact =
    messageContacts.find((contact) => contact.id === selectedContactId) ?? filteredContacts[0] ?? null
  const activeThread = activeContact
    ? messageThreads.find((thread) => thread.contactId === activeContact.id) ?? null
    : null
  const selectedChannelInfo =
    messageChannels.find((channel) => channel.key === selectedChannel) ?? messageChannels[0] ?? null

  function appendLog(level: TaskLog['level'], message: string) {
    setLogs((current) => [
      {
        id: `log-${Date.now()}`,
        level,
        message,
        createdAt: '刚刚',
      },
      ...current,
    ])
  }

  function toggleEnvironmentSelection(environmentId: string) {
    setSelectedEnvironmentIds((current) =>
      current.includes(environmentId)
        ? current.filter((id) => id !== environmentId)
        : [...current, environmentId],
    )
  }

  function openCreateEnvironment() {
    setEditingEnvironmentId(null)
    setEnvironmentForm({
      name: '',
      groupName: groupFilter === 'all' ? 'TikTok Operation' : groupFilter,
      purpose: 'operation',
      platform: 'Windows 11 / Chrome 124',
      proxyLabel: proxies[0]?.endpoint ?? '',
    })
    setEnvironmentDrawerOpen(true)
  }

  function openEditEnvironment(environment: EnvironmentItem) {
    setEditingEnvironmentId(environment.id)
    setEnvironmentForm({
      id: environment.id,
      name: environment.name,
      groupName: environment.groupName,
      purpose: environment.purpose,
      platform: environment.platform,
      proxyLabel: environment.proxyLabel,
    })
    setEnvironmentDrawerOpen(true)
  }

  function saveEnvironment() {
    startTransition(() => {
      if (editingEnvironmentId) {
        setEnvironments((current) =>
          current.map((item) =>
            item.id === editingEnvironmentId
              ? {
                  ...item,
                  name: environmentForm.name,
                  groupName: environmentForm.groupName,
                  purpose: environmentForm.purpose,
                  platform: environmentForm.platform,
                  proxyLabel: environmentForm.proxyLabel,
                }
              : item,
          ),
        )
        appendLog('success', `环境 ${environmentForm.name} 已更新到新的 Web 前台工作区。`)
      } else {
        setEnvironments((current) => [
          {
            id: `env-${Date.now()}`,
            name: environmentForm.name,
            groupName: environmentForm.groupName,
            purpose: environmentForm.purpose,
            platform: environmentForm.platform,
            proxyLabel: environmentForm.proxyLabel,
            status: 'idle',
            fingerprintScore: 90,
            syncStatus: 'pending',
          },
          ...current,
        ])
        appendLog('success', `新环境 ${environmentForm.name} 已在 Web 前台骨架中创建。`)
      }
      setEnvironmentDrawerOpen(false)
    })
  }

  function openCreateCloudPhone() {
    setEditingCloudPhoneId(null)
    setCloudPhoneForm({
      name: '',
      provider: 'Self-hosted',
      region: 'SG',
    })
    setCloudPhoneDrawerOpen(true)
  }

  function openEditCloudPhone(cloudPhone: CloudPhoneItem) {
    setEditingCloudPhoneId(cloudPhone.id)
    setCloudPhoneForm({
      id: cloudPhone.id,
      name: cloudPhone.name,
      provider: cloudPhone.provider,
      region: cloudPhone.region,
    })
    setCloudPhoneDrawerOpen(true)
  }

  function saveCloudPhone() {
    startTransition(() => {
      if (editingCloudPhoneId) {
        setCloudPhones((current) =>
          current.map((item) =>
            item.id === editingCloudPhoneId
              ? {
                  ...item,
                  name: cloudPhoneForm.name,
                  provider: cloudPhoneForm.provider,
                  region: cloudPhoneForm.region,
                }
              : item,
          ),
        )
        appendLog('success', `云手机 ${cloudPhoneForm.name} 已更新。`)
      } else {
        setCloudPhones((current) => [
          {
            id: `cp-${Date.now()}`,
            name: cloudPhoneForm.name,
            provider: cloudPhoneForm.provider,
            region: cloudPhoneForm.region,
            status: 'idle',
          },
          ...current,
        ])
        appendLog('success', `云手机 ${cloudPhoneForm.name} 已加入工作台。`)
      }
      setCloudPhoneDrawerOpen(false)
    })
  }

  function runBulkAction(
    actionLabel: BulkTask['action'],
    updater: (item: EnvironmentItem) => EnvironmentItem,
    successMessage: string,
  ) {
    if (selectedEnvironmentIds.length === 0) {
      appendLog('warning', '请先在环境矩阵中选择需要批量操作的环境。')
      return
    }

    setEnvironments((current) =>
      current.map((item) =>
        selectedEnvironmentIds.includes(item.id) ? updater(item) : item,
      ),
    )
    setBulkTasks((current) => [
      {
        id: `bulk-${Date.now()}`,
        action: actionLabel,
        profileIds: selectedEnvironmentIds,
        status: 'success',
        updatedAt: '刚刚',
      },
      ...current,
    ])
    appendLog('success', successMessage)
  }

  function testProxy(proxyId: string) {
    const proxy = proxies.find((item) => item.id === proxyId)
    if (!proxy) {
      return
    }
    appendLog(
      proxy.status === 'online' ? 'success' : 'warning',
      `代理 ${proxy.name} 的连通性测试已完成，当前状态：${proxy.status.toUpperCase()}.`,
    )
  }

  function runAssistAction(label: string) {
    appendLog('info', `已触发消息辅助动作：${label}。`)
  }

  function sendMessage() {
    if (!activeThread || !activeContact || draftMessage.trim().length === 0) {
      return
    }

    const nextMessage: MessageRecord = {
      id: `msg-${Date.now()}`,
      direction: 'outgoing',
      text: draftMessage.trim(),
      status: 'sent',
      createdAt: '刚刚',
      senderLabel: 'Duokai Operator',
    }

    setMessageThreads((current) =>
      current.map((thread) =>
        thread.threadId === activeThread.threadId
          ? { ...thread, messages: [...thread.messages, nextMessage] }
          : thread,
      ),
    )
    setDraftMessage('')
    appendLog('success', `已向 ${activeContact.name} 发送一条新的聚合消息回复。`)
  }

  function currentPage() {
    if (activePage === 'dashboard') {
      const environmentSafetyScore = 92
      const runtimeMemoryUsage = 45
      const runtimeMemoryValue = '7.2 GB'
      const runtimeSuccessRate = 91
      const successCount = 1204
      const failedCount = 2

      return (
        <div className="space-y-8">
          <div className="grid gap-5 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {/* 环境安全指数卡片 */}
            <Card className="web-glass web-panel web-kpi-glow rounded-[30px] border-white/8 p-6 min-h-[320px] h-auto flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">环境安全指数</p>
                </div>
                <Badge tone="success" className="px-3 py-1.5 text-xs">
                  {deviceStatus.status === 'online' ? 'RUNTIME ONLINE' : 'RUNTIME OFFLINE'}
                </Badge>
              </div>
              
              <div className="flex-1 min-h-0">
                <div className="grid grid-cols-[96px,minmax(0,1fr)] items-center gap-5 max-[1399px]:grid-cols-1">
                  <RingStat
                    value={environmentSafetyScore}
                    tone="sky"
                    size={84}
                    label={`${environmentSafetyScore}%`}
                  />
                  <div className="min-w-0">
                    <p className="text-[clamp(1.75rem,2.2vw,3rem)] font-semibold tracking-tight text-sky-300 break-words">Excellent</p>
                    <p className="mt-1 text-sm text-slate-500">No leaks found</p>
                  </div>
                </div>
                
                <p className="mt-5 text-sm text-slate-400 break-words [overflow-wrap:anywhere] leading-6">
                  当前指纹环境运行面稳定，浏览器实例和配置回传链路都由本地执行器接管。
                </p>
              </div>
              
              <div className="mt-auto">
                <div className="grid grid-cols-3 gap-3 max-[1199px]:grid-cols-2 max-[991px]:grid-cols-1">
                  <MetricCard label="运行时版本" value={deviceStatus.runtimeVersion} tone="sky" />
                  <MetricCard label="当前并发" value={`${deviceStatus.concurrentRunning}`} tone="emerald" />
                  <MetricCard label="消息桥版本" value={deviceStatus.messageBridgeVersion} tone="violet" />
                </div>
              </div>
            </Card>
            
            {/* 内存占用卡片 */}
            <Card className="web-glass web-panel rounded-[30px] border-white/8 p-6 min-h-[320px] h-auto flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">M4 内存占用 (REAL-TIME)</p>
              </div>
              
              <div className="flex-1 min-h-0">
                <div className="grid grid-cols-[96px,minmax(0,1fr)] items-center gap-5 max-[1399px]:grid-cols-1">
                  <RingStat value={runtimeMemoryUsage} tone="rose" size={76} label={`${runtimeMemoryUsage}%`} />
                  <div className="text-right min-w-0">
                    <p className="text-[clamp(1.75rem,2.2vw,3rem)] font-semibold tracking-tight text-white break-words">{runtimeMemoryValue}</p>
                    <p className="mt-1 text-sm text-slate-500">Matrix Overhead</p>
                  </div>
                </div>
                
                <div className="mt-6 space-y-3">
                  <RealtimeStrip label="消息桥接占比" value={64} tone="sky" />
                  <RealtimeStrip label="环境并发负载" value={58} tone="rose" />
                </div>
              </div>
            </Card>
            
            {/* Runtime 吞吐率卡片 */}
            <Card className="web-glass web-panel rounded-[30px] border-white/8 p-6 min-h-[320px] h-auto flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">本地 Runtime 吞吐率</p>
              </div>
              
              <div className="flex-1 min-h-0">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[clamp(1.25rem,1.5vw,1.5rem)] font-semibold text-white break-words">Processing Task: #{bulkTasks[0]?.profileIds[0] ?? '882'}</p>
                    <p className="mt-1 text-sm text-slate-500">实时汇总环境和消息接入队列。</p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                    <span className="web-dot-pulse h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    Stable
                  </div>
                </div>
                
                <div className="mt-5">
                  <ProgressStat value={runtimeSuccessRate} tone="emerald" />
                </div>
                
                <div className="mt-5 grid grid-cols-2 gap-3 max-[991px]:grid-cols-1">
                  <MiniResultCard label="Succeeded" value={String(successCount)} accent="emerald" />
                  <MiniResultCard label="Failed" value={String(failedCount)} accent="rose" />
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {/* 双核心工作负载卡片 */}
            <Card className="web-glass web-panel rounded-[30px] border-white/8 p-6 min-h-[320px] h-auto flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[clamp(1rem,1.2vw,1.25rem)] font-semibold text-white break-words">双核心工作负载</h3>
                  <p className="mt-1 text-sm text-slate-400">同一首页同时追踪环境运行与消息群控状态。</p>
                </div>
                <Badge tone="primary" className="px-3 py-1 text-xs">
                  Matrix
                </Badge>
              </div>
              
              <div className="flex-1 min-h-0">
                <div className="grid gap-4 md:grid-cols-2 max-[991px]:grid-cols-1">
                  {Object.entries(groupedEnvironmentCounts).map(([groupName, count]) => (
                    <div key={groupName} className="web-panel web-panel-soft rounded-[24px] border border-white/8 bg-white/4 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white break-words">{groupName}</p>
                          <p className="mt-1 text-xs text-slate-400">环境实例数量</p>
                        </div>
                        <div className="text-[clamp(1.5rem,2vw,2rem)] font-semibold text-sky-300 break-words">{count}</div>
                      </div>
                      <div className="mt-4">
                        <ProgressStat value={Math.min(100, count * 22)} tone="sky" compact />
                      </div>
                    </div>
                  ))}
                  <div className="web-panel web-panel-soft rounded-[24px] border border-white/8 bg-white/4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white break-words">活跃会话</p>
                        <p className="mt-1 text-xs text-slate-400">当前聚合消息联系人</p>
                      </div>
                      <div className="text-[clamp(1.5rem,2vw,2rem)] font-semibold text-cyan-300 break-words">{filteredContacts.length}</div>
                    </div>
                    <div className="mt-4">
                      <ProgressStat value={Math.min(100, filteredContacts.length * 28)} tone="amber" compact />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* 消息群控概览卡片 */}
            <Card className="web-glass web-panel rounded-[30px] border-white/8 p-6 min-h-[320px] h-auto flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[clamp(1rem,1.2vw,1.25rem)] font-semibold text-white break-words">消息群控概览</h3>
                  <p className="mt-1 text-sm text-slate-400">未读渠道、AI 辅助动作和最近回复状态在这里预览。</p>
                </div>
                <Button variant="ghost" onClick={() => setActivePage('messageControl')} className="whitespace-nowrap">
                  进入消息群控
                </Button>
              </div>
              
              <div className="flex-1 min-h-0 space-y-3">
                {messageChannels.filter((item) => item.key !== 'all').map((channel) => (
                  <div key={channel.key} className="web-panel web-panel-soft rounded-[22px] border border-white/6 bg-white/4 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-white break-words">{channel.label}</span>
                      <Badge tone={channel.unreadCount > 0 ? 'warning' : 'neutral'}>
                        未读 {channel.unreadCount}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <ProgressStat value={Math.min(100, channel.unreadCount * 12 + 18)} tone="emerald" compact />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )
    }

    if (activePage === 'messageControl') {
      return (
        <div className="grid min-h-[720px] gap-0 overflow-hidden rounded-[34px] border border-white/8 bg-[rgba(11,18,34,0.88)] shadow-[0_30px_80px_rgba(2,6,23,0.35)] xl:grid-cols-[320px_1fr]">
          <aside className="web-glass flex min-h-full flex-col border-r border-white/8 bg-[rgba(14,20,38,0.88)] p-6">
            <div className="mb-6 space-y-4">
              <div className="web-toolbar rounded-[24px] p-4">
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">当前视图</p>
                  <div className="w-full">
                    <Select
                      value={selectedChannel}
                      onChange={(event) => setSelectedChannel(event.target.value as MessageChannelKey)}
                      className="h-11 rounded-[18px] border-white/10 bg-[rgba(22,31,51,0.9)] px-3 text-xs font-semibold uppercase tracking-[0.16em] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    >
                      {messageChannels.map((channel) => (
                        <option key={channel.key} value={channel.key}>
                          {channel.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <span>未读 {selectedChannelInfo?.unreadCount ?? 0}</span>
                    <span className="web-summary-sep" />
                    <span>{filteredContacts.length} 会话</span>
                  </div>
                </div>
              </div>
              <Input
                value={messageSearchQuery}
                onChange={(event) => setMessageSearchQuery(event.target.value)}
                placeholder="搜索联系人..."
              />
            </div>
            <div className="web-scroll flex-1 space-y-3 overflow-y-auto">
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => setSelectedContactId(contact.id)}
                  className={`web-panel flex w-full items-start gap-3 rounded-[22px] border p-4 text-left transition-all ${
                    activeContact?.id === contact.id
                      ? 'border-sky-400/30 bg-sky-500/12 shadow-[0_18px_30px_rgba(14,165,233,0.14)]'
                      : 'border-white/6 bg-white/4 hover:border-white/12 hover:bg-white/6'
                  }`}
                >
                  <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-sky-500/20 font-semibold text-sky-200">
                    {contact.avatar}
                    <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[rgba(14,20,38,1)] ${
                      contact.presence === 'active'
                        ? 'bg-emerald-400'
                        : contact.presence === 'idle'
                          ? 'bg-amber-400'
                          : 'bg-slate-500'
                    }`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-white">{contact.name}</p>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{contact.lastMessageAt}</span>
                    </div>
                    <p className="mt-2 truncate text-sm text-slate-300">{contact.lastMessage}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${channelTone(contact.channel)}`}>
                        {contact.channel.toUpperCase()}
                      </span>
                      {contact.unreadCount > 0 ? (
                        <span className="rounded-full bg-sky-500/16 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                          未读 {contact.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="flex min-h-full flex-col bg-[rgba(10,16,30,0.88)]">
            <header className="flex items-center justify-between border-b border-white/8 bg-white/4 px-8 py-6">
              <div className="flex items-center gap-4">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20 font-semibold text-sky-200">
                  {activeContact?.avatar ?? 'NA'}
                  <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[rgba(10,16,30,1)] bg-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">{activeContact?.name ?? '未选择联系人'}</h3>
                  <div className="mt-2 flex items-center gap-2">
                    {activeContact ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${channelTone(activeContact.channel)}`}>
                        {activeContact.channel.toUpperCase()}
                      </span>
                    ) : null}
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                      {activeContact?.presence === 'active' ? 'Active Now' : activeContact?.presence ?? 'idle'}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Sync Stable
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button className="web-icon-button h-12 w-12">
                  <Video size={18} />
                </button>
                <button className="web-icon-button h-12 w-12">
                  <PhoneCall size={18} />
                </button>
              </div>
            </header>

            <div className="web-scroll flex-1 space-y-6 overflow-y-auto px-8 py-8">
              {activeThread?.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[68%] rounded-[22px] px-5 py-4 text-sm leading-6 ${
                      message.direction === 'outgoing'
                        ? 'web-message-bubble-out rounded-br-[8px] text-white'
                        : 'web-message-bubble-in rounded-bl-[8px] text-slate-100'
                    }`}
                  >
                    <p className="m-0">{message.text}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-white/60">
                      <span>{message.senderLabel}</span>
                      <span>{message.createdAt}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/8 bg-[rgba(13,20,36,0.92)] px-8 py-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                {messageAssistActions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => runAssistAction(action.label)}
                    className="web-chip text-[11px] font-semibold"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <div className="web-toolbar rounded-[24px] p-3">
                <div className="flex items-center gap-3">
                  <Sparkles size={16} className="text-sky-300" />
                  <input
                    value={draftMessage}
                    onChange={(event) => setDraftMessage(event.target.value)}
                    placeholder="AI 助手已准备就绪，输入回复内容..."
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                  />
                  <Button variant="primary" size="sm" onClick={sendMessage}>
                    SEND
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )
    }

    if (activePage === 'environment') {
      return (
        <div className="space-y-6">
          <Card className="web-glass web-panel rounded-[28px] border-white/8 p-5">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <Input
                  className="min-w-[260px] flex-1"
                  placeholder="搜索环境名称、平台、代理..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <Select
                  value={groupFilter}
                  onChange={(event) => setGroupFilter(event.target.value)}
                  className="w-[180px] rounded-[18px] border-white/10 bg-[rgba(22,31,51,0.9)]"
                >
                  {groupOptions.map((item) => (
                    <option key={item} value={item}>
                      {item === 'all' ? '全部分组' : item}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="web-toolbar-tight flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectedEnvironmentIds(filteredEnvironments.map((item) => item.id))}
                >
                  全选当前结果
                </Button>
                <Button size="sm" variant="primary" onClick={openCreateEnvironment}>
                  <Plus size={16} />
                  新建环境
                </Button>
              </div>
            </div>
          </Card>

          <Card className="web-glass web-panel rounded-[28px] border-white/8 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white break-words">环境批量动作栏</p>
                <p className="mt-1 text-xs text-slate-400">已选择 {selectedEnvironmentIds.length} 个环境</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    runBulkAction(
                      '批量启动',
                      (item) => ({ ...item, status: 'running' }),
                      '选中的环境已发送批量启动指令到本地执行器。',
                    )
                  }
                >
                  <Play size={16} />
                  批量启动
                </Button>
                <div className="web-toolbar-tight flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      runBulkAction(
                        '批量停止',
                        (item) => ({ ...item, status: 'idle' }),
                        '选中的环境已发送批量停止指令。',
                      )
                    }
                  >
                    <Square size={16} />
                    批量停止
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      runBulkAction(
                        '批量同步配置',
                        (item) => ({ ...item, syncStatus: 'synced' }),
                        '选中的环境已完成配置同步任务。',
                      )
                    }
                  >
                    批量同步配置
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      runBulkAction(
                        '批量拉取登录态',
                        (item) => ({ ...item, syncStatus: 'pending' }),
                        '选中的环境已发送登录态拉取请求。',
                      )
                    }
                  >
                    批量拉取登录态
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="web-glass web-panel rounded-[28px] border-white/8 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white break-words">最近批量任务</p>
                <p className="mt-1 text-xs text-slate-400">环境批量控制已回归到 Environment Matrix 内部工作流。</p>
              </div>
              <Badge tone="primary">{bulkTasks.length} 条记录</Badge>
            </div>
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
              {bulkTasks.map((task) => (
                <div key={task.id} className="web-panel web-panel-soft rounded-[22px] border border-white/6 bg-white/4 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white break-words">{task.action}</p>
                    <Badge tone={bulkTaskTone(task.status)}>{task.status.toUpperCase()}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">涉及 {task.profileIds.length} 个环境</p>
                  <p className="mt-3 text-[11px] text-slate-500">更新时间 {task.updatedAt}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {filteredEnvironments.map((environment) => (
              <Card key={environment.id} className="web-glass web-panel rounded-[28px] border-white/8 p-5">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="flex min-w-0 items-start gap-4">
                    <input
                      type="checkbox"
                      className="web-checkbox mt-1 shrink-0"
                      checked={selectedEnvironmentIds.includes(environment.id)}
                      onChange={() => toggleEnvironmentSelection(environment.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-[clamp(1rem,1.2vw,1.25rem)] font-semibold text-white break-words">{environment.name}</h3>
                        <Badge tone={badgeToneForStatus(environment.status)}>{environment.status.toUpperCase()}</Badge>
                        <Badge tone={syncTone(environment.syncStatus)}>{environment.syncStatus.toUpperCase()}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-400 break-words">{environment.platform}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone="neutral">{environment.groupName}</Badge>
                        <Badge tone="primary">{environment.proxyLabel}</Badge>
                        <Badge tone="success">指纹分 {environment.fingerprintScore}</Badge>
                      </div>
                      <div className="mt-4">
                        <ProgressStat value={environment.fingerprintScore} tone="sky" compact />
                      </div>
                    </div>
                  </div>
                  <div className="web-toolbar-tight shrink-0 flex flex-col gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openEditEnvironment(environment)}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant={environment.status === 'running' ? 'secondary' : 'primary'}
                      onClick={() => {
                        setEnvironments((current) =>
                          current.map((item) =>
                            item.id === environment.id
                              ? { ...item, status: environment.status === 'running' ? 'idle' : 'running' }
                              : item,
                          ),
                        )
                        appendLog(
                          'success',
                          `${environment.name} 已在 Web 前台触发 ${environment.status === 'running' ? '停止' : '启动'}。`,
                        )
                      }}
                    >
                      {environment.status === 'running' ? <Square size={16} /> : <Play size={16} />}
                      {environment.status === 'running' ? '停止' : '启动'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )
    }

    if (activePage === 'cloudPhones') {
      return (
        <div className="space-y-6">
          <Card className="web-glass web-panel rounded-[28px] border-white/8 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[clamp(1rem,1.2vw,1.25rem)] font-semibold text-white break-words">手机环境工作台</p>
                <p className="mt-2 text-sm text-slate-400 break-words">首期先对齐桌面端云手机工作区，并保留抽屉式编辑体验。</p>
              </div>
              <Button variant="primary" onClick={openCreateCloudPhone}>
                <Plus size={16} />
                新建云手机
              </Button>
            </div>
          </Card>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {cloudPhones.map((cloudPhone) => (
              <Card key={cloudPhone.id} className="web-glass web-panel rounded-[28px] border-white/8 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-[clamp(1rem,1.2vw,1.25rem)] font-semibold text-white break-words">{cloudPhone.name}</h3>
                    <p className="mt-2 text-sm text-slate-400 break-words">{cloudPhone.provider} / {cloudPhone.region}</p>
                    <div className="mt-3">
                      <Badge tone={cloudPhone.status === 'running' ? 'success' : cloudPhone.status === 'idle' ? 'neutral' : 'danger'}>
                        {cloudPhone.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="mt-4">
                      <ProgressStat value={cloudPhone.status === 'running' ? 78 : cloudPhone.status === 'idle' ? 46 : 18} tone={cloudPhone.status === 'running' ? 'emerald' : cloudPhone.status === 'idle' ? 'sky' : 'rose'} compact />
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => openEditCloudPhone(cloudPhone)}>
                    编辑
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )
    }

    if (activePage === 'proxy') {
      return (
        <div className="space-y-6">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {proxies.map((proxy) => (
              <Card key={proxy.id} className="web-glass web-panel rounded-[28px] border-white/8 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[clamp(1rem,1.2vw,1.25rem)] font-semibold text-white break-words">{proxy.name}</p>
                    <p className="mt-2 font-mono text-sm text-sky-300 break-words">{proxy.endpoint}</p>
                    <p className="mt-2 text-sm text-slate-400 break-words">{proxy.type}</p>
                  </div>
                  <Badge tone={proxy.status === 'online' ? 'success' : 'danger'}>
                    {proxy.status === 'online' ? `${proxy.latencyMs}ms` : 'Offline'}
                  </Badge>
                </div>
                <div className="mt-4">
                  <ProgressStat value={proxy.status === 'online' ? Math.max(12, 100 - proxy.latencyMs) : 8} tone={proxy.status === 'online' ? 'emerald' : 'rose'} compact />
                </div>
                <div className="mt-5 flex gap-2">
                  <Button variant="secondary" onClick={() => testProxy(proxy.id)}>
                    <RefreshCcw size={16} />
                    测试
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )
    }

    if (activePage === 'logs') {
      return (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <Card className="web-glass web-panel rounded-[28px] border-white/8 p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-white">本地执行器日志流</h3>
              <Badge tone="success">HEARTBEAT HEALTHY</Badge>
            </div>
            <div className="web-scroll max-h-[620px] space-y-3 overflow-y-auto rounded-[24px] border border-white/6 bg-[rgba(3,8,18,0.68)] p-4 font-mono text-sm">
              {logs.map((log) => (
                <div key={log.id} className="web-panel web-panel-soft rounded-[18px] border border-white/5 bg-white/4 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={logTone(log.level)}>{log.level.toUpperCase()}</Badge>
                    <span className="text-xs text-slate-500">{log.createdAt}</span>
                  </div>
                  <p className="mt-3 text-slate-200">{log.message}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="web-glass web-panel rounded-[28px] border-white/8 p-5">
            <h3 className="text-lg font-semibold text-white">运行诊断</h3>
            <div className="mt-5 space-y-4">
              <DiagnosticRow label="默认设备" value={deviceStatus.name} />
              <DiagnosticRow label="运行时版本" value={deviceStatus.runtimeVersion} />
              <DiagnosticRow label="消息桥状态" value={`${deviceStatus.messageBridgeStatus} / ${deviceStatus.messageBridgeVersion}`} />
              <DiagnosticRow label="最后错误" value={deviceStatus.lastError ?? '无'} />
              <DiagnosticRow label="下载渠道" value="GitHub Releases" />
              <DiagnosticRow label="默认 API" value={settings.apiBase} />
            </div>
          </Card>
        </div>
      )
    }

    if (activePage === 'settings') {
      return (
        <Card className="web-glass web-panel rounded-[28px] border-white/8 p-6">
          <div className="grid gap-5 xl:grid-cols-2">
            <SettingField
              label="控制面 API Base"
              description="后续联调阶段 Web 前台将从这里获取真实环境、代理、日志与消息群控数据。"
            >
              <Input value={settings.apiBase} onChange={(event) => setSettings((current) => ({ ...current, apiBase: event.target.value }))} />
            </SettingField>
            <SettingField
              label="默认设备"
              description="当前首期仍以本地执行器为默认设备，后续消息接入节点也会在这里统一显示。"
            >
              <Input value={settings.defaultDeviceId} onChange={(event) => setSettings((current) => ({ ...current, defaultDeviceId: event.target.value }))} />
            </SettingField>
          </div>
          <div className="mt-6">
            <Button
              variant="primary"
              onClick={() => appendLog('success', '系统设置已在新 Web 前台工作区中保存。')}
            >
              保存设置
            </Button>
          </div>
        </Card>
      )
    }

    if (activePage === 'account') {
      return (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card className="web-glass web-panel rounded-[28px] border-white/8 p-6">
            <h3 className="text-lg font-semibold text-white">账号资料</h3>
            <div className="mt-5 space-y-4">
              <DiagnosticRow label="姓名" value={account.name} />
              <DiagnosticRow label="邮箱" value={account.email} />
              <DiagnosticRow label="角色" value={account.role} />
              <DiagnosticRow label="工作区" value={account.workspace} />
            </div>
          </Card>
          <Card className="web-glass web-panel rounded-[28px] border-white/8 p-6">
            <h3 className="text-lg font-semibold text-white">设备与安装</h3>
            <p className="mt-3 text-sm text-slate-400">
              本轮前台不实现安装器本身，但保留环境执行器与消息接入节点的状态位和下载入口。
            </p>
            <div className="mt-5 rounded-[24px] border border-white/8 bg-white/4 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-white">{deviceStatus.name}</p>
                  <p className="mt-2 text-sm text-slate-400">最近心跳：{deviceStatus.lastHeartbeatAt}</p>
                  <p className="mt-1 text-sm text-slate-400">消息桥：{deviceStatus.messageBridgeStatus} / {deviceStatus.messageBridgeVersion}</p>
                </div>
                <Badge tone="success">ONLINE</Badge>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => appendLog('info', 'GitHub Releases 下载入口已触发占位逻辑。')}>
                  <Download size={16} />
                  下载本地执行器
                </Button>
                <Button variant="secondary" onClick={() => appendLog('info', '设备绑定向导将在后续阶段实现。')}>
                  设备绑定说明
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )
    }

    return (
      <Card className="web-glass web-panel rounded-[32px] border-white/8 p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-500/12 text-sky-300">
          <BellDot size={28} />
        </div>
        <h3 className="mt-6 text-2xl font-semibold text-white">{pageMeta.notice.title}</h3>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-400">{pageMeta.notice.subtitle}</p>
      </Card>
    )
  }

  return (
    <div className="flex min-h-screen bg-transparent text-[var(--web-text)]">
      <aside className="web-glass web-scroll sticky top-0 flex h-screen w-[288px] shrink-0 flex-col overflow-y-auto border-r border-white/8 px-5 py-6 transition-all duration-300 ease-in-out max-[1199px]:w-[88px] max-[1199px]:px-2">
        <div className="flex items-center gap-3 px-3 max-[1199px]:justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.16)]">
            <LayoutGrid size={24} />
          </div>
          <div className="max-[1199px]:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-slate-500">Matrix Edition</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Duokai Web</h1>
          </div>
        </div>

        <div className="mt-8 space-y-1">
          {(['command', 'operations', 'system'] as const).map((section) => (
            <div key={section} className="space-y-1">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-600 max-[1199px]:hidden">
                {section === 'command' ? 'Command Center' : section === 'operations' ? 'Environment' : 'Admin & Logs'}
              </div>
              {consolePages
                .filter((item) => item.section === section)
                .map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActivePage(item.key)}
                    data-active={activePage === item.key}
                    className={`web-nav-button flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${
                      activePage === item.key
                        ? 'bg-[linear-gradient(90deg,rgba(14,165,233,0.22),rgba(14,165,233,0.02))] text-white shadow-[inset_4px_0_0_0_rgba(56,189,248,1)]'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3 text-sm font-medium">
                      {iconForPage(item.key)}
                      <span className="max-[1199px]:hidden">{item.label}</span>
                    </span>
                    {item.badge ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.badge === 'Live'
                            ? 'bg-emerald-500/14 text-emerald-300'
                            : 'bg-slate-700/70 text-slate-300'
                        } max-[1199px]:hidden`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                ))}
            </div>
          ))}
        </div>

        <Card className="mt-auto rounded-[28px] border-white/8 bg-white/6 p-4 shadow-none max-[1199px]:p-2">
          <div className="flex items-center gap-3 max-[1199px]:justify-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/20 text-sm font-semibold text-sky-300">
              M4
            </div>
            <div className="max-[1199px]:hidden">
              <p className="text-sm font-semibold text-white">本地执行器在线</p>
              <p className="mt-1 text-xs text-slate-400">GitHub Releases / {deviceStatus.runtimeVersion}</p>
            </div>
          </div>
          <Button className="mt-4 w-full max-[1199px]:hidden" variant="secondary">
            设备说明
          </Button>
        </Card>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-white/8 bg-[rgba(5,11,24,0.72)] px-8 py-5 backdrop-blur-2xl">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">{pageMeta[activePage].title}</p>
              <h2 className="mt-2 text-[clamp(1.5rem,2.2vw,2.5rem)] font-semibold tracking-tight text-white break-words">{pageMeta[activePage].title}</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-400 break-words [overflow-wrap:anywhere] leading-6">{pageMeta[activePage].subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="web-chip web-chip-active text-xs font-semibold uppercase tracking-[0.18em] whitespace-nowrap">
                <span className="web-dot-pulse h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Local Runtime Online
              </div>
              <div className="web-chip text-xs font-semibold uppercase tracking-[0.18em] whitespace-nowrap">
                {environments.filter((item) => item.status === 'running').length} 环境运行中
              </div>
            </div>
          </div>
        </header>

        <div className="web-grid-bg web-scroll min-h-0 flex-1 overflow-y-auto px-8 py-8">
          {currentPage()}
        </div>
      </main>

      <Sheet open={environmentDrawerOpen}>
        <SheetOverlay onClick={() => setEnvironmentDrawerOpen(false)} />
        <SheetContent className="max-w-[460px] bg-[rgba(10,18,36,0.96)]">
          <SheetHeader>
            <SheetTitle>{editingEnvironmentId ? '编辑环境' : '新建环境'}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-5">
            <Input
              placeholder="环境名称"
              value={environmentForm.name}
              onChange={(event) => setEnvironmentForm((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
              placeholder="分组名称"
              value={environmentForm.groupName}
              onChange={(event) => setEnvironmentForm((current) => ({ ...current, groupName: event.target.value }))}
            />
            <Select
              value={environmentForm.purpose}
              onChange={(event) =>
                setEnvironmentForm((current) => ({
                  ...current,
                  purpose: event.target.value as EnvironmentItem['purpose'],
                }))
              }
            >
              <option value="operation">运营环境</option>
              <option value="nurture">养号环境</option>
            </Select>
            <Input
              placeholder="平台描述"
              value={environmentForm.platform}
              onChange={(event) => setEnvironmentForm((current) => ({ ...current, platform: event.target.value }))}
            />
            <Input
              placeholder="代理地址"
              value={environmentForm.proxyLabel}
              onChange={(event) => setEnvironmentForm((current) => ({ ...current, proxyLabel: event.target.value }))}
            />
            <div className="flex gap-3 pt-4">
              <Button className="flex-1" variant="secondary" onClick={() => setEnvironmentDrawerOpen(false)}>
                取消
              </Button>
              <Button className="flex-1" variant="primary" onClick={saveEnvironment}>
                保存环境
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={cloudPhoneDrawerOpen}>
        <SheetOverlay onClick={() => setCloudPhoneDrawerOpen(false)} />
        <SheetContent className="max-w-[420px] bg-[rgba(10,18,36,0.96)]">
          <SheetHeader>
            <SheetTitle>{editingCloudPhoneId ? '编辑云手机' : '新建云手机'}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-5">
            <Input
              placeholder="云手机名称"
              value={cloudPhoneForm.name}
              onChange={(event) => setCloudPhoneForm((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
              placeholder="Provider"
              value={cloudPhoneForm.provider}
              onChange={(event) => setCloudPhoneForm((current) => ({ ...current, provider: event.target.value }))}
            />
            <Input
              placeholder="Region"
              value={cloudPhoneForm.region}
              onChange={(event) => setCloudPhoneForm((current) => ({ ...current, region: event.target.value }))}
            />
            <div className="flex gap-3 pt-4">
              <Button className="flex-1" variant="secondary" onClick={() => setCloudPhoneDrawerOpen(false)}>
                取消
              </Button>
              <Button className="flex-1" variant="primary" onClick={saveCloudPhone}>
                保存云手机
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function iconForPage(page: ConsolePageKey) {
  const className = 'h-4 w-4'

  if (page === 'dashboard') return <Gauge className={className} />
  if (page === 'messageControl') return <MessageSquare className={className} />
  if (page === 'environment') return <Boxes className={className} />
  if (page === 'cloudPhones') return <Smartphone className={className} />
  if (page === 'proxy') return <Globe className={className} />
  if (page === 'logs') return <Logs className={className} />
  if (page === 'settings') return <Settings className={className} />
  if (page === 'account') return <UserCircle2 className={className} />
  return <BellDot className={className} />
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'sky' | 'emerald' | 'violet'
}) {
  const toneClass =
    tone === 'sky'
      ? 'bg-sky-500/10 text-sky-300'
      : tone === 'emerald'
        ? 'bg-emerald-500/10 text-emerald-300'
        : 'bg-violet-500/10 text-violet-300'

  return (
    <div className={`web-panel web-panel-soft rounded-[22px] border border-white/6 p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}

function RingStat({
  value,
  tone,
  size,
  label,
}: {
  value: number
  tone: 'sky' | 'rose'
  size: number
  label: string
}) {
  const [animatedValue, setAnimatedValue] = useState(0)
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const clampedValue = Math.max(0, Math.min(100, animatedValue))
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference

  const stroke = tone === 'sky' ? '#38bdf8' : '#fb4f70'
  const glowStroke = tone === 'sky' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(251, 79, 112, 0.18)'

  useEffect(() => {
    const duration = 1000
    const steps = 60
    const stepDuration = duration / steps
    let currentStep = 0

    const timer = setInterval(() => {
      currentStep++
      const progress = Math.min(currentStep / steps, 1)
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      setAnimatedValue(easeProgress * value)

      if (currentStep >= steps) {
        clearInterval(timer)
      }
    }, stepDuration)

    return () => clearInterval(timer)
  }, [value])

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg className="web-ring-svg h-full w-full" viewBox="0 0 84 84" aria-hidden="true">
        <circle className="web-ring-track" cx="42" cy="42" r={radius} strokeWidth="6" />

        <circle
          className="web-ring-glow"
          cx="42"
          cy="42"
          r={radius}
          strokeWidth="10"
          stroke={glowStroke}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />

        <circle
          className="web-ring-value"
          cx="42"
          cy="42"
          r={radius}
          strokeWidth="6"
          stroke={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-white">
        {label}
      </div>
    </div>
  )
}

function ProgressStat({
  value,
  tone,
  compact = false,
}: {
  value: number
  tone: 'emerald' | 'amber' | 'sky' | 'rose'
  compact?: boolean
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const fillClass =
    tone === 'emerald'
      ? 'bg-[linear-gradient(90deg,#22c55e,#34d399)]'
      : tone === 'amber'
        ? 'bg-[linear-gradient(90deg,#f59e0b,#fbbf24)]'
        : tone === 'rose'
          ? 'bg-[linear-gradient(90deg,#f43f5e,#fb7185)]'
          : 'bg-[linear-gradient(90deg,#0ea5e9,#38bdf8)]'

  return (
    <div className="space-y-2">
      {!compact ? (
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          <span>Load</span>
          <span>{clamped}%</span>
        </div>
      ) : null}
      <div className={`web-progress-track ${compact ? 'h-2.5' : 'h-3'}`}>
        <div 
          className={`web-progress-fill ${fillClass}`} 
          style={{ 
            width: '0%',
            animation: 'progressAnimation 1s ease-out forwards',
            animationDelay: `${Math.random() * 0.3}s`,
            '--progress': `${clamped}%`
          }} 
        />
      </div>
    </div>
  )
}

function RealtimeStrip({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'sky' | 'rose'
}) {
  return (
    <div className="rounded-[20px] border border-white/6 bg-white/4 p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <ProgressStat value={value} tone={tone} compact />
    </div>
  )
}

function MiniResultCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: 'emerald' | 'rose'
}) {
  return (
    <div className="web-panel web-panel-soft rounded-[20px] border border-white/8 bg-[rgba(255,255,255,0.05)] px-5 py-4">
      <p className="text-center text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-center text-3xl font-semibold ${accent === 'emerald' ? 'text-emerald-300' : 'text-rose-300'}`}>
        {value}
      </p>
    </div>
  )
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="web-panel web-panel-soft rounded-[22px] border border-white/6 bg-white/4 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-white">{value}</p>
    </div>
  )
}

function SettingField({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: import('react').ReactNode
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/4 p-5">
      <p className="text-base font-semibold text-white">{label}</p>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}
