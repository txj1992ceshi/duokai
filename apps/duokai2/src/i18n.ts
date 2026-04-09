import type {
  CloudPhoneRecord,
  ImportResult,
  LogCategory,
  LogLevel,
  ProfileStatus,
  ProxyRecord,
} from './shared/types'

export type LocaleCode = 'zh-CN' | 'en-US'

export type Dictionary = {
  appName: string
  appTagline: string
  nav: Record<'dashboard' | 'profiles' | 'cloudPhones' | 'proxies' | 'logs' | 'settings', string>
  common: {
    loading: string
    noProxy: string
    noTags: string
    never: string
    ready: string
    missing: string
    healthy: string
    search: string
    all: string
    save: string
    edit: string
    delete: string
    clone: string
    launch: string
    stop: string
    test: string
    clear: string
    create: string
    confirmDeleteMany: (count: number) => string
    runningSummary: (running: number, total: number) => string
    activeNow: (count: number) => string
    importSummary: (result: ImportResult) => string
    envLanguageLabel: (code: string) => string
  }
  busy: Record<
    | 'createProfile'
    | 'updateProfile'
    | 'cloneProfile'
    | 'launchProfile'
    | 'stopProfile'
    | 'deleteProfile'
    | 'createProxy'
    | 'updateProxy'
    | 'testProxy'
    | 'deleteProxy'
    | 'createCloudPhone'
    | 'updateCloudPhone'
    | 'deleteCloudPhone'
    | 'startCloudPhone'
    | 'stopCloudPhone'
    | 'testCloudPhoneProxy'
    | 'refreshCloudPhones'
    | 'bulkStartCloudPhones'
    | 'bulkStopCloudPhones'
    | 'bulkDeleteCloudPhones'
    | 'bulkAssignCloudPhoneGroup'
    | 'saveSettings'
    | 'clearLogs'
    | 'openProfileFolder'
    | 'createTemplate'
    | 'updateTemplate'
    | 'deleteTemplate'
    | 'createTemplateFromProfile'
    | 'bulkStart'
    | 'bulkStop'
    | 'bulkDelete'
    | 'bulkAssignGroup'
    | 'exportBundle'
    | 'importBundle',
    string
  >
  dashboard: {
    title: string
    subtitle: string
    profiles: string
    proxies: string
    logs: string
    templates: string
    chromium: string
    retained: string
    recentLogs: string
    noLogs: string
    installChromium: string
  }
  profiles: {
    title: string
    manageProfiles: string
    manageTemplates: string
    newProfile: string
    fromTemplate: string
    saveAsTemplate: string
    createProfile: string
    editProfile: string
    firstProfile: string
    revealFolder: string
    groupFallback: string
    name: string
    group: string
    tags: string
    tagsPlaceholder: string
    proxy: string
    language: string
    timezone: string
    resolution: string
    webrtc: string
    userAgent: string
    notes: string
    updateProfile: string
    deleteProfile: string
    statusFilter: string
    groupFilter: string
    selectedCount: (count: number) => string
    batchStart: string
    batchStop: string
    batchDelete: string
    batchAssignGroup: string
    createFromTemplateHint: string
  }
  cloudPhones: {
    title: string
    subtitle: string
    create: string
    edit: string
    empty: string
    computeType: string
    platform: string
    provider: string
    defaultProvider: string
    defaultProviderHealth: string
    providerSettings: string
    ipLookupChannel: string
    proxyType: string
    ipProtocol: string
    proxyHost: string
    proxyPort: string
    proxyUsername: string
    proxyPassword: string
    udpEnabled: string
    fingerprint: string
    autoLanguage: string
    autoTimezone: string
    autoGeolocation: string
    geolocation: string
    testProxy: string
    refreshStatuses: string
    details: string
    batchStart: string
    batchStop: string
    batchDelete: string
    batchAssignGroup: string
    selectedCount: (count: number) => string
    computeBasic: string
    computeStandard: string
    computePro: string
    protocolIpv4: string
    protocolIpv6: string
    providerMock: string
    providerSelfHosted: string
    providerThirdParty: string
    providerLocalEmulator: string
    baseUrl: string
    clusterId: string
    vendorKey: string
    localDevice: string
    adbPath: string
    statusLabel: (status: CloudPhoneRecord['status']) => string
  }
  templates: {
    title: string
    newTemplate: string
    createTemplate: string
    editTemplate: string
    empty: string
    createProfileFromTemplate: string
    updateTemplate: string
    deleteTemplate: string
  }
  proxies: {
    title: string
    newProxy: string
    createProxy: string
    editProxy: string
    empty: string
    name: string
    type: string
    host: string
    port: string
    username: string
    password: string
    updateProxy: string
    deleteProxy: string
  }
  logs: {
    title: string
    clear: string
    empty: string
  }
  settings: {
    title: string
    controlPlaneApiBase: string
    workspaceName: string
    defaultHomePage: string
    notes: string
    runtimeMaxConcurrentStarts: string
    runtimeMaxActiveProfiles: string
    runtimeMaxLaunchRetries: string
    save: string
    runtimePaths: string
    appData: string
    profiles: string
    chromiumBinary: string
    missingChromium: string
    language: string
    defaultEnvironmentLanguage: string
    cloudPhoneProviders: string
    defaultCloudPhoneProvider: string
    selfHostedBaseUrl: string
    selfHostedApiKey: string
    selfHostedClusterId: string
    thirdPartyVendor: string
    thirdPartyBaseUrl: string
    thirdPartyToken: string
    localEmulatorAdbPath: string
    providerHealth: string
    localDevices: string
    languageZh: string
    languageEn: string
    themeMode: string
    themeSystem: string
    themeLight: string
    themeDark: string
    dataTools: string
    exportBundle: string
    importBundle: string
    importResult: string
    runtimeInfo: string
    runtimeMode: string
    mainVersion: string
    preloadVersion: string
    rendererVersion: string
    buildMarker: string
    capabilities: string
  }
}

export const dictionaries: Record<LocaleCode, Dictionary> = {
  'zh-CN': {
    appName: 'Duokai 工作台',
    appTagline: '核心功能版',
    nav: {
      dashboard: '概览',
      profiles: '环境配置',
      cloudPhones: '云手机环境',
      proxies: '代理管理',
      logs: '运行日志',
      settings: '设置',
    },
    common: {
      loading: '加载中...',
      noProxy: '不使用代理',
      noTags: '暂无标签',
      never: '从未',
      ready: '就绪',
      missing: '缺失',
      healthy: '可用',
      search: '搜索',
      all: '全部',
      save: '保存',
      edit: '编辑',
      delete: '删除',
      clone: '克隆',
      launch: '启动',
      stop: '停止',
      test: '测试',
      clear: '清空',
      create: '创建',
      confirmDeleteMany: (count) => `确认删除选中的 ${count} 个环境吗？`,
      runningSummary: (running, total) => `${running} 个运行中 / 共 ${total} 个环境`,
      activeNow: (count) => `${count} 个正在运行`,
      importSummary: (result) =>
        `已导入 环境 ${result.profilesImported} 个，代理 ${result.proxiesImported} 个，模板 ${result.templatesImported} 个，云手机 ${result.cloudPhonesImported} 个，workspace 快照 ${result.workspaceSnapshotsImported || 0} 个`,
      envLanguageLabel: (code) => {
        if (code === 'zh-CN') return '简体中文'
        if (code === 'zh-TW') return '繁體中文'
        if (code === 'en-US') return 'English'
        if (code === 'ja-JP') return '日本語'
        if (code === 'ko-KR') return '한국어'
        return 'English'
      },
    },
    busy: {
      createProfile: '正在创建环境...',
      updateProfile: '正在更新环境...',
      cloneProfile: '正在克隆环境...',
      launchProfile: '正在启动环境...',
      stopProfile: '正在停止环境...',
      deleteProfile: '正在删除环境...',
      createProxy: '正在创建代理...',
      updateProxy: '正在更新代理...',
      testProxy: '正在测试代理...',
      deleteProxy: '正在删除代理...',
      createCloudPhone: '正在创建云手机环境...',
      updateCloudPhone: '正在更新云手机环境...',
      deleteCloudPhone: '正在删除云手机环境...',
      startCloudPhone: '正在启动云手机环境...',
      stopCloudPhone: '正在停止云手机环境...',
      testCloudPhoneProxy: '正在检测云手机代理...',
      refreshCloudPhones: '正在刷新云手机状态...',
      bulkStartCloudPhones: '正在批量启动云手机环境...',
      bulkStopCloudPhones: '正在批量停止云手机环境...',
      bulkDeleteCloudPhones: '正在批量删除云手机环境...',
      bulkAssignCloudPhoneGroup: '正在批量修改云手机分组...',
      saveSettings: '正在保存设置...',
      clearLogs: '正在清空日志...',
      openProfileFolder: '正在打开环境目录...',
      createTemplate: '正在创建模板...',
      updateTemplate: '正在更新模板...',
      deleteTemplate: '正在删除模板...',
      createTemplateFromProfile: '正在从环境生成模板...',
      bulkStart: '正在批量启动环境...',
      bulkStop: '正在批量停止环境...',
      bulkDelete: '正在批量删除环境...',
      bulkAssignGroup: '正在批量修改分组...',
      exportBundle: '正在导出配置包...',
      importBundle: '正在导入配置包...',
    },
    dashboard: {
      title: '浏览器运营桌面端',
      subtitle: '本地环境隔离、模板复用、批量操作与运行状态管理。',
      profiles: '环境',
      proxies: '代理',
      logs: '日志',
      templates: '模板',
      chromium: 'Chromium',
      retained: '保留最近 500 条',
      recentLogs: '最近日志',
      noLogs: '暂无日志。',
      installChromium: '请运行 npm run install:chromium',
    },
    profiles: {
      title: '环境工作台',
      manageProfiles: '环境',
      manageTemplates: '模板',
      newProfile: '新建环境',
      fromTemplate: '从模板创建',
      saveAsTemplate: '保存为模板',
      createProfile: '创建环境',
      editProfile: '编辑环境',
      firstProfile: '先创建第一个环境再开始使用。',
      revealFolder: '打开目录',
      groupFallback: '未分组',
      name: '名称',
      group: '分组',
      tags: '标签',
      tagsPlaceholder: '店铺A, 美国西部',
      proxy: '代理',
      language: '指纹语言',
      timezone: '时区',
      resolution: '分辨率',
      webrtc: 'WebRTC',
      userAgent: 'User Agent',
      notes: '备注',
      updateProfile: '更新环境',
      deleteProfile: '删除环境',
      statusFilter: '状态筛选',
      groupFilter: '分组筛选',
      selectedCount: (count) => `已选 ${count} 个`,
      batchStart: '批量启动',
      batchStop: '批量停止',
      batchDelete: '批量删除',
      batchAssignGroup: '批量改分组',
      createFromTemplateHint: '从模板载入后可继续编辑再保存。',
    },
    cloudPhones: {
      title: '云手机环境',
      subtitle: 'Android 云手机环境、算力、代理与指纹设置管理。',
      create: '创建云手机环境',
      edit: '编辑云手机环境',
      empty: '暂无云手机环境，请先创建。',
      computeType: '算力类型',
      platform: '平台',
      provider: 'Provider',
      defaultProvider: '默认 Provider',
      defaultProviderHealth: '默认 Provider 健康状态',
      providerSettings: 'Provider 设置',
      ipLookupChannel: 'IP 查询渠道',
      proxyType: '代理类型',
      ipProtocol: 'IP 协议',
      proxyHost: '代理主机',
      proxyPort: '代理端口',
      proxyUsername: '代理账号',
      proxyPassword: '代理密码',
      udpEnabled: 'UDP 协议',
      fingerprint: '指纹设置',
      autoLanguage: '语言自动跟随 IP',
      autoTimezone: '时区自动跟随 IP',
      autoGeolocation: '地理位置自动跟随 IP',
      geolocation: '地理位置',
      testProxy: '代理检测',
      refreshStatuses: '刷新状态',
      details: '查看详情',
      batchStart: '批量启动',
      batchStop: '批量停止',
      batchDelete: '批量删除',
      batchAssignGroup: '批量改分组',
      selectedCount: (count) => `已选 ${count} 个云手机环境`,
      computeBasic: '基础型',
      computeStandard: '标准型',
      computePro: '高性能',
      protocolIpv4: 'IPv4',
      protocolIpv6: 'IPv6',
      providerMock: 'Mock Provider',
      providerSelfHosted: '自建服务',
      providerThirdParty: '第三方服务',
      providerLocalEmulator: '本机模拟器',
      baseUrl: '服务地址',
      clusterId: '集群 ID',
      vendorKey: '服务商标识',
      localDevice: '本机设备',
      adbPath: 'ADB 路径',
      statusLabel: (status) => {
        if (status === 'draft') return '草稿'
        if (status === 'provisioned') return '已配置'
        if (status === 'starting') return '启动中'
        if (status === 'running') return '运行中'
        if (status === 'stopping') return '停止中'
        if (status === 'stopped') return '已停止'
        return '异常'
      },
    },
    templates: {
      title: '模板库',
      newTemplate: '新建模板',
      createTemplate: '创建模板',
      editTemplate: '编辑模板',
      empty: '先保存一个模板，后续创建环境会更快。',
      createProfileFromTemplate: '用模板创建环境',
      updateTemplate: '更新模板',
      deleteTemplate: '删除模板',
    },
    proxies: {
      title: '代理管理',
      newProxy: '新建代理',
      createProxy: '创建代理',
      editProxy: '编辑代理',
      empty: '添加代理后可绑定到浏览器环境。',
      name: '名称',
      type: '类型',
      host: '主机',
      port: '端口',
      username: '用户名',
      password: '密码',
      updateProxy: '更新代理',
      deleteProxy: '删除代理',
    },
    logs: {
      title: '运行与审计日志',
      clear: '清空日志',
      empty: '暂无日志记录。',
    },
    settings: {
      title: '应用设置',
      controlPlaneApiBase: '控制面地址',
      workspaceName: '工作区名称',
      defaultHomePage: '默认首页',
      notes: '运营备注',
      runtimeMaxConcurrentStarts: '最大并发启动数',
      runtimeMaxActiveProfiles: '最大活跃窗口数',
      runtimeMaxLaunchRetries: '启动重试次数',
      save: '保存设置',
      runtimePaths: '运行路径',
      appData: '应用数据目录',
      profiles: '环境目录',
      chromiumBinary: 'Chromium 路径',
      missingChromium: '未找到 Chromium，请先通过 Playwright 安装。',
      language: '界面语言',
      defaultEnvironmentLanguage: '新环境默认语言',
      cloudPhoneProviders: '云手机 Provider 设置',
      defaultCloudPhoneProvider: '默认云手机 Provider',
      selfHostedBaseUrl: '自建服务地址',
      selfHostedApiKey: '自建服务 API Key',
      selfHostedClusterId: '自建集群 ID',
      thirdPartyVendor: '第三方服务商',
      thirdPartyBaseUrl: '第三方服务地址',
      thirdPartyToken: '第三方 Token',
      localEmulatorAdbPath: 'ADB 路径',
      providerHealth: 'Provider 健康状态',
      localDevices: '本机设备',
      languageZh: '简体中文',
      languageEn: 'English',
      themeMode: '主题模式',
      themeSystem: '跟随系统',
      themeLight: '浅色',
      themeDark: '深色',
      dataTools: '数据工具',
      exportBundle: '导出配置包',
      importBundle: '导入配置包',
      importResult: '导入结果',
      runtimeInfo: '运行时信息',
      runtimeMode: '运行模式',
      mainVersion: 'Main 版本',
      preloadVersion: 'Preload 版本',
      rendererVersion: 'Renderer 版本',
      buildMarker: '构建标记',
      capabilities: '已注册能力',
    },
  },
  'en-US': {
    appName: 'Browser Studio',
    appTagline: 'Core Features',
    nav: {
      dashboard: 'Dashboard',
      profiles: 'Profiles',
      cloudPhones: 'Cloud phones',
      proxies: 'Proxies',
      logs: 'Logs',
      settings: 'Settings',
    },
    common: {
      loading: 'Loading...',
      noProxy: 'No proxy',
      noTags: 'No tags',
      never: 'Never',
      ready: 'Ready',
      missing: 'Missing',
      healthy: 'Healthy',
      search: 'Search',
      all: 'All',
      save: 'Save',
      edit: 'Edit',
      delete: 'Delete',
      clone: 'Clone',
      launch: 'Launch',
      stop: 'Stop',
      test: 'Test',
      clear: 'Clear',
      create: 'Create',
      confirmDeleteMany: (count) => `Delete ${count} selected profiles?`,
      runningSummary: (running, total) => `${running} running / ${total} profiles`,
      activeNow: (count) => `${count} active right now`,
      importSummary: (result) =>
        `Imported ${result.profilesImported} profiles, ${result.proxiesImported} proxies, ${result.templatesImported} templates, ${result.cloudPhonesImported} cloud phones, and ${result.workspaceSnapshotsImported || 0} workspace snapshots`,
      envLanguageLabel: (code) => {
        if (code === 'zh-CN') return 'Simplified Chinese'
        if (code === 'zh-TW') return 'Traditional Chinese'
        if (code === 'en-US') return 'English'
        if (code === 'ja-JP') return 'Japanese'
        if (code === 'ko-KR') return 'Korean'
        return 'English'
      },
    },
    busy: {
      createProfile: 'Creating profile...',
      updateProfile: 'Updating profile...',
      cloneProfile: 'Cloning profile...',
      launchProfile: 'Launching profile...',
      stopProfile: 'Stopping profile...',
      deleteProfile: 'Deleting profile...',
      createProxy: 'Creating proxy...',
      updateProxy: 'Updating proxy...',
      testProxy: 'Testing proxy...',
      deleteProxy: 'Deleting proxy...',
      createCloudPhone: 'Creating cloud phone environment...',
      updateCloudPhone: 'Updating cloud phone environment...',
      deleteCloudPhone: 'Deleting cloud phone environment...',
      startCloudPhone: 'Starting cloud phone environment...',
      stopCloudPhone: 'Stopping cloud phone environment...',
      testCloudPhoneProxy: 'Testing cloud phone proxy...',
      refreshCloudPhones: 'Refreshing cloud phone statuses...',
      bulkStartCloudPhones: 'Bulk starting cloud phone environments...',
      bulkStopCloudPhones: 'Bulk stopping cloud phone environments...',
      bulkDeleteCloudPhones: 'Bulk deleting cloud phone environments...',
      bulkAssignCloudPhoneGroup: 'Bulk assigning cloud phone group...',
      saveSettings: 'Saving settings...',
      clearLogs: 'Clearing logs...',
      openProfileFolder: 'Opening profile folder...',
      createTemplate: 'Creating template...',
      updateTemplate: 'Updating template...',
      deleteTemplate: 'Deleting template...',
      createTemplateFromProfile: 'Creating template from profile...',
      bulkStart: 'Bulk starting profiles...',
      bulkStop: 'Bulk stopping profiles...',
      bulkDelete: 'Bulk deleting profiles...',
      bulkAssignGroup: 'Bulk assigning group...',
      exportBundle: 'Exporting bundle...',
      importBundle: 'Importing bundle...',
    },
    dashboard: {
      title: 'Browser operations desktop',
      subtitle: 'Local profile isolation, templates, batch actions, and runtime visibility.',
      profiles: 'Profiles',
      proxies: 'Proxies',
      logs: 'Logs',
      templates: 'Templates',
      chromium: 'Chromium',
      retained: 'latest 500 retained',
      recentLogs: 'Recent logs',
      noLogs: 'No logs yet.',
      installChromium: 'Run npm run install:chromium',
    },
    profiles: {
      title: 'Profile workspace',
      manageProfiles: 'Profiles',
      manageTemplates: 'Templates',
      newProfile: 'New profile',
      fromTemplate: 'From template',
      saveAsTemplate: 'Save as template',
      createProfile: 'Create profile',
      editProfile: 'Edit profile',
      firstProfile: 'Create your first profile to start.',
      revealFolder: 'Reveal folder',
      groupFallback: 'Ungrouped',
      name: 'Name',
      group: 'Group',
      tags: 'Tags',
      tagsPlaceholder: 'store-a, us-west',
      proxy: 'Proxy',
      language: 'Fingerprint language',
      timezone: 'Timezone',
      resolution: 'Resolution',
      webrtc: 'WebRTC',
      userAgent: 'User agent',
      notes: 'Notes',
      updateProfile: 'Update profile',
      deleteProfile: 'Delete profile',
      statusFilter: 'Status filter',
      groupFilter: 'Group filter',
      selectedCount: (count) => `${count} selected`,
      batchStart: 'Bulk start',
      batchStop: 'Bulk stop',
      batchDelete: 'Bulk delete',
      batchAssignGroup: 'Assign group',
      createFromTemplateHint: 'Load from a template, then edit before saving.',
    },
    cloudPhones: {
      title: 'Cloud phone environments',
      subtitle: 'Android cloud phone environments with compute, proxy, and fingerprint settings.',
      create: 'Create cloud phone',
      edit: 'Edit cloud phone',
      empty: 'No cloud phone environments yet.',
      computeType: 'Compute type',
      platform: 'Platform',
      provider: 'Provider',
      defaultProvider: 'Default provider',
      defaultProviderHealth: 'Default provider health',
      providerSettings: 'Provider settings',
      ipLookupChannel: 'IP lookup channel',
      proxyType: 'Proxy type',
      ipProtocol: 'IP protocol',
      proxyHost: 'Proxy host',
      proxyPort: 'Proxy port',
      proxyUsername: 'Proxy username',
      proxyPassword: 'Proxy password',
      udpEnabled: 'UDP protocol',
      fingerprint: 'Fingerprint settings',
      autoLanguage: 'Auto language from IP',
      autoTimezone: 'Auto timezone from IP',
      autoGeolocation: 'Auto geolocation from IP',
      geolocation: 'Geolocation',
      testProxy: 'Test proxy',
      refreshStatuses: 'Refresh statuses',
      details: 'Details',
      batchStart: 'Bulk start',
      batchStop: 'Bulk stop',
      batchDelete: 'Bulk delete',
      batchAssignGroup: 'Assign group',
      selectedCount: (count) => `${count} cloud phones selected`,
      computeBasic: 'Basic',
      computeStandard: 'Standard',
      computePro: 'Pro',
      protocolIpv4: 'IPv4',
      protocolIpv6: 'IPv6',
      providerMock: 'Mock Provider',
      providerSelfHosted: 'Self-hosted',
      providerThirdParty: 'Third-party',
      providerLocalEmulator: 'Local emulator',
      baseUrl: 'Base URL',
      clusterId: 'Cluster ID',
      vendorKey: 'Vendor key',
      localDevice: 'Local device',
      adbPath: 'ADB path',
      statusLabel: (status) => {
        if (status === 'draft') return 'Draft'
        if (status === 'provisioned') return 'Provisioned'
        if (status === 'starting') return 'Starting'
        if (status === 'running') return 'Running'
        if (status === 'stopping') return 'Stopping'
        if (status === 'stopped') return 'Stopped'
        return 'Error'
      },
    },
    templates: {
      title: 'Template library',
      newTemplate: 'New template',
      createTemplate: 'Create template',
      editTemplate: 'Edit template',
      empty: 'Save a template first to speed up profile creation.',
      createProfileFromTemplate: 'Create profile from template',
      updateTemplate: 'Update template',
      deleteTemplate: 'Delete template',
    },
    proxies: {
      title: 'Proxies',
      newProxy: 'New proxy',
      createProxy: 'Create proxy',
      editProxy: 'Edit proxy',
      empty: 'Add a proxy to bind network identity to profiles.',
      name: 'Name',
      type: 'Type',
      host: 'Host',
      port: 'Port',
      username: 'Username',
      password: 'Password',
      updateProxy: 'Update proxy',
      deleteProxy: 'Delete proxy',
    },
    logs: {
      title: 'Runtime and audit logs',
      clear: 'Clear logs',
      empty: 'No logs recorded yet.',
    },
    settings: {
      title: 'Application settings',
      controlPlaneApiBase: 'Control plane URL',
      workspaceName: 'Workspace name',
      defaultHomePage: 'Default home page',
      notes: 'Operational notes',
      runtimeMaxConcurrentStarts: 'Max concurrent starts',
      runtimeMaxActiveProfiles: 'Max active profiles',
      runtimeMaxLaunchRetries: 'Launch retry limit',
      save: 'Save settings',
      runtimePaths: 'Runtime paths',
      appData: 'App data',
      profiles: 'Profiles',
      chromiumBinary: 'Chromium binary',
      missingChromium: 'Missing. Install with Playwright.',
      language: 'Interface language',
      defaultEnvironmentLanguage: 'Default profile language',
      cloudPhoneProviders: 'Cloud phone provider settings',
      defaultCloudPhoneProvider: 'Default cloud phone provider',
      selfHostedBaseUrl: 'Self-hosted base URL',
      selfHostedApiKey: 'Self-hosted API key',
      selfHostedClusterId: 'Self-hosted cluster ID',
      thirdPartyVendor: 'Third-party vendor',
      thirdPartyBaseUrl: 'Third-party base URL',
      thirdPartyToken: 'Third-party token',
      localEmulatorAdbPath: 'ADB path',
      providerHealth: 'Provider health',
      localDevices: 'Local devices',
      languageZh: 'Simplified Chinese',
      languageEn: 'English',
      themeMode: 'Theme mode',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      dataTools: 'Data tools',
      exportBundle: 'Export bundle',
      importBundle: 'Import bundle',
      importResult: 'Import result',
      runtimeInfo: 'Runtime info',
      runtimeMode: 'Mode',
      mainVersion: 'Main version',
      preloadVersion: 'Preload version',
      rendererVersion: 'Renderer version',
      buildMarker: 'Build marker',
      capabilities: 'Capabilities',
    },
  },
}

export function getLocaleFromSettings(value?: string): LocaleCode {
  return value === 'en-US' ? 'en-US' : 'zh-CN'
}

const STATUS_LABELS: Record<
  LocaleCode,
  Partial<Record<ProfileStatus | ProxyRecord['status'], string>>
> = {
  'zh-CN': {
    queued: '排队中',
    starting: '启动中',
    running: '运行中',
    idle: '待机',
    stopped: '已停止',
    error: '异常',
    online: '在线',
    offline: '离线',
    unknown: '未知',
  },
  'en-US': {
    unknown: 'Unknown',
    online: 'Online',
    offline: 'Offline',
  },
}

const LOG_LEVEL_LABELS: Record<LocaleCode, Record<LogLevel, string>> = {
  'zh-CN': {
    info: '信息',
    warn: '警告',
    error: '错误',
  },
  'en-US': {
    info: 'info',
    warn: 'warn',
    error: 'error',
  },
}

const LOG_CATEGORY_LABELS: Record<LocaleCode, Record<LogCategory, string>> = {
  'zh-CN': {
    profile: '环境',
    proxy: '代理',
    runtime: '运行时',
    'cloud-phone': '云手机',
    system: '系统',
  },
  'en-US': {
    profile: 'profile',
    proxy: 'proxy',
    runtime: 'runtime',
    'cloud-phone': 'cloud-phone',
    system: 'system',
  },
}

export function translateStatus(
  locale: LocaleCode,
  status: ProfileStatus | ProxyRecord['status'],
): string {
  const localized = STATUS_LABELS[locale][status]
  if (localized) {
    return localized
  }
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function translateLogLevel(locale: LocaleCode, level: LogLevel): string {
  return LOG_LEVEL_LABELS[locale][level]
}

export function translateLogCategory(locale: LocaleCode, category: LogCategory): string {
  return LOG_CATEGORY_LABELS[locale][category]
}
