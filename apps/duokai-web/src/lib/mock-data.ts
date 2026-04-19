export type ConsolePageKey =
  | 'dashboard'
  | 'messageControl'
  | 'environment'
  | 'cloudPhones'
  | 'proxy'
  | 'logs'
  | 'settings'
  | 'account'
  | 'notice'

export type EnvironmentStatus = 'running' | 'idle' | 'starting' | 'error'
export type MessageChannelKey = 'all' | 'tiktok' | 'whatsapp' | 'telegram' | 'instagram'

export interface DeviceStatus {
  id: string
  name: string
  status: 'online' | 'offline'
  runtimeVersion: string
  concurrentRunning: number
  lastHeartbeatAt: string
  lastError: string | null
  installChannel: 'github-releases'
  messageBridgeStatus: 'online' | 'offline'
  messageBridgeVersion: string
}

export interface EnvironmentItem {
  id: string
  name: string
  groupName: string
  purpose: 'operation' | 'nurture'
  platform: string
  proxyLabel: string
  status: EnvironmentStatus
  fingerprintScore: number
  syncStatus: 'synced' | 'pending' | 'conflict'
}

export interface CloudPhoneItem {
  id: string
  name: string
  provider: string
  region: string
  status: 'running' | 'idle' | 'error'
}

export interface ProxyItem {
  id: string
  name: string
  endpoint: string
  type: string
  status: 'online' | 'offline'
  latencyMs: number
}

export interface TaskLog {
  id: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
  createdAt: string
}

export interface BulkTask {
  id: string
  action: string
  profileIds: string[]
  status: 'queued' | 'running' | 'success' | 'partial_failure' | 'failed'
  updatedAt: string
}

export interface ConsoleSettings {
  themeMode: 'dark'
  apiBase: string
  defaultDeviceId: string
  onboardingHint: boolean
}

export interface AccountProfile {
  name: string
  email: string
  role: string
  workspace: string
}

export interface MessageChannel {
  key: MessageChannelKey
  label: string
  unreadCount: number
}

export interface MessageContact {
  id: string
  channel: Exclude<MessageChannelKey, 'all'>
  name: string
  avatar: string
  presence: 'active' | 'idle' | 'offline'
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}

export interface MessageRecord {
  id: string
  direction: 'incoming' | 'outgoing'
  text: string
  status: 'sent' | 'delivered' | 'draft'
  createdAt: string
  senderLabel: string
}

export interface MessageThread {
  threadId: string
  contactId: string
  channel: Exclude<MessageChannelKey, 'all'>
  messages: MessageRecord[]
}

export interface MessageAssistAction {
  key: 'translate' | 'polish' | 'generate_reply' | 'use_template'
  label: string
  hint: string
}

export const consolePages: Array<{
  key: ConsolePageKey
  label: string
  badge?: string
  section: 'command' | 'operations' | 'system'
}> = [
  { key: 'dashboard', label: '数据总览首页', section: 'command' },
  { key: 'messageControl', label: '聚合消息群控', section: 'command', badge: 'Live' },
  { key: 'environment', label: '浏览器环境矩阵', section: 'operations' },
  { key: 'cloudPhones', label: '手机环境(安卓)', section: 'operations' },
  { key: 'proxy', label: '专业代理 IP 模块', section: 'operations' },
  { key: 'logs', label: '运行状态与诊断', section: 'system' },
  { key: 'settings', label: '全局系统设置', section: 'system' },
  { key: 'account', label: '账号与设备', section: 'system' },
  { key: 'notice', label: '通知中心', section: 'system', badge: 'Soon' },
]

export const initialDeviceStatus: DeviceStatus = {
  id: 'device-m4-local',
  name: 'Mac mini M4 Local Agent',
  status: 'online',
  runtimeVersion: '3.6.8',
  concurrentRunning: 3,
  lastHeartbeatAt: '刚刚',
  lastError: null,
  installChannel: 'github-releases',
  messageBridgeStatus: 'online',
  messageBridgeVersion: '0.2.1',
}

export const initialEnvironments: EnvironmentItem[] = [
  {
    id: 'env-882',
    name: 'TK_PROMO_US_01',
    groupName: 'TikTok Operation',
    purpose: 'operation',
    platform: 'Windows 11 / Chrome 124',
    proxyLabel: '104.22.19.4:8080',
    status: 'running',
    fingerprintScore: 96,
    syncStatus: 'synced',
  },
  {
    id: 'env-901',
    name: 'SHOPIFY_NURTURE_02',
    groupName: 'Shopify Nurture',
    purpose: 'nurture',
    platform: 'macOS Sonoma / Chrome 123',
    proxyLabel: '188.10.2.41:8088',
    status: 'idle',
    fingerprintScore: 92,
    syncStatus: 'pending',
  },
  {
    id: 'env-915',
    name: 'META_REVIEW_UK_07',
    groupName: 'Meta Review',
    purpose: 'operation',
    platform: 'Windows 10 / Edge 123',
    proxyLabel: '72.24.11.6:9000',
    status: 'starting',
    fingerprintScore: 89,
    syncStatus: 'synced',
  },
  {
    id: 'env-928',
    name: 'TT_REGISTER_SEED_12',
    groupName: 'Seed Accounts',
    purpose: 'nurture',
    platform: 'Windows 11 / Chrome 124',
    proxyLabel: '91.201.44.8:7000',
    status: 'error',
    fingerprintScore: 77,
    syncStatus: 'conflict',
  },
]

export const initialCloudPhones: CloudPhoneItem[] = [
  {
    id: 'cp-301',
    name: 'Android Cluster A-01',
    provider: 'Self-hosted',
    region: 'SG',
    status: 'running',
  },
  {
    id: 'cp-302',
    name: 'Android Cluster B-14',
    provider: 'Self-hosted',
    region: 'US',
    status: 'idle',
  },
]

export const initialProxies: ProxyItem[] = [
  {
    id: 'prx-01',
    name: 'SG Static Node',
    endpoint: '128.21.10.2:8888',
    type: 'SOCKS5 Static',
    status: 'online',
    latencyMs: 12,
  },
  {
    id: 'prx-02',
    name: 'US Rotation Pool',
    endpoint: '104.20.40.6:9090',
    type: 'HTTP Rotation',
    status: 'online',
    latencyMs: 29,
  },
  {
    id: 'prx-03',
    name: 'EU Backup Node',
    endpoint: '88.14.3.15:7001',
    type: 'HTTPS Static',
    status: 'offline',
    latencyMs: 0,
  },
]

export const initialLogs: TaskLog[] = [
  {
    id: 'log-1',
    level: 'success',
    message: 'Local runtime heartbeat received from Mac mini M4 Local Agent.',
    createdAt: '14:02:01',
  },
  {
    id: 'log-2',
    level: 'info',
    message: 'TikTok message bridge pulled 12 latest threads into the aggregate inbox.',
    createdAt: '14:02:06',
  },
  {
    id: 'log-3',
    level: 'warning',
    message: 'SHOPIFY_NURTURE_02 has pending configuration sync tasks awaiting confirmation.',
    createdAt: '14:02:11',
  },
  {
    id: 'log-4',
    level: 'error',
    message: 'ENV_928 failed to launch because the local profile workspace is missing.',
    createdAt: '14:02:16',
  },
]

export const initialBulkTasks: BulkTask[] = [
  {
    id: 'bulk-1',
    action: '批量启动',
    profileIds: ['env-882', 'env-915'],
    status: 'running',
    updatedAt: '刚刚',
  },
  {
    id: 'bulk-2',
    action: '批量拉取配置',
    profileIds: ['env-901', 'env-928'],
    status: 'partial_failure',
    updatedAt: '3 分钟前',
  },
]

export const initialSettings: ConsoleSettings = {
  themeMode: 'dark',
  apiBase: 'http://127.0.0.1:3100',
  defaultDeviceId: 'device-m4-local',
  onboardingHint: true,
}

export const initialAccount: AccountProfile = {
  name: 'jj',
  email: 'jj@example.com',
  role: 'Owner',
  workspace: 'Duokai Internal Ops',
}

export const initialMessageChannels: MessageChannel[] = [
  { key: 'all', label: 'ALL', unreadCount: 18 },
  { key: 'tiktok', label: 'TikTok', unreadCount: 9 },
  { key: 'whatsapp', label: 'WA', unreadCount: 4 },
  { key: 'telegram', label: 'Telegram', unreadCount: 3 },
  { key: 'instagram', label: 'Instagram', unreadCount: 2 },
]

export const initialMessageContacts: MessageContact[] = [
  {
    id: 'contact-1',
    channel: 'tiktok',
    name: 'Mark Zucker',
    avatar: 'MZ',
    presence: 'active',
    lastMessage: 'Is this available?',
    lastMessageAt: '14:02',
    unreadCount: 2,
  },
  {
    id: 'contact-2',
    channel: 'whatsapp',
    name: 'Olivia Sparks',
    avatar: 'OS',
    presence: 'idle',
    lastMessage: 'Can you send the updated offer list?',
    lastMessageAt: '13:48',
    unreadCount: 1,
  },
  {
    id: 'contact-3',
    channel: 'telegram',
    name: 'Noah Bridge',
    avatar: 'NB',
    presence: 'offline',
    lastMessage: 'We should switch that account to a new proxy.',
    lastMessageAt: '11:25',
    unreadCount: 0,
  },
]

export const initialMessageThreads: MessageThread[] = [
  {
    threadId: 'thread-1',
    contactId: 'contact-1',
    channel: 'tiktok',
    messages: [
      {
        id: 'msg-1',
        direction: 'incoming',
        text: 'Hi there! How can I order this TikTok promo pack?',
        status: 'delivered',
        createdAt: '14:00',
        senderLabel: 'Mark Zucker',
      },
      {
        id: 'msg-2',
        direction: 'outgoing',
        text: 'Hello! You can visit our site at matrix.hub or I can send the link.',
        status: 'delivered',
        createdAt: '14:02',
        senderLabel: 'Duokai AI Reply',
      },
    ],
  },
  {
    threadId: 'thread-2',
    contactId: 'contact-2',
    channel: 'whatsapp',
    messages: [
      {
        id: 'msg-3',
        direction: 'incoming',
        text: 'Can you send the updated offer list?',
        status: 'delivered',
        createdAt: '13:48',
        senderLabel: 'Olivia Sparks',
      },
      {
        id: 'msg-4',
        direction: 'outgoing',
        text: 'Sure, I am preparing the latest package summary and will send it shortly.',
        status: 'sent',
        createdAt: '13:50',
        senderLabel: 'Duokai Operator',
      },
    ],
  },
  {
    threadId: 'thread-3',
    contactId: 'contact-3',
    channel: 'telegram',
    messages: [
      {
        id: 'msg-5',
        direction: 'incoming',
        text: 'We should switch that account to a new proxy.',
        status: 'delivered',
        createdAt: '11:25',
        senderLabel: 'Noah Bridge',
      },
    ],
  },
]

export const initialMessageAssistActions: MessageAssistAction[] = [
  {
    key: 'translate',
    label: '自动翻译',
    hint: '将最新来信快速翻译成当前工作语言。',
  },
  {
    key: 'polish',
    label: 'AI 润色',
    hint: '优化当前回复草稿的语气与表达。',
  },
  {
    key: 'generate_reply',
    label: '生成回复',
    hint: '基于当前会话和商品上下文自动生成建议回复。',
  },
  {
    key: 'use_template',
    label: '快捷模板',
    hint: '应用常用话术模板，提高群控回复效率。',
  },
]
