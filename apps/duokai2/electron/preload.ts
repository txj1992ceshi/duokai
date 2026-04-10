import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../src/shared/ipc'
import type {
  CloudPhoneBulkActionPayload,
  CreateCloudPhoneInput,
  CreateProfileInput,
  CreateProxyInput,
  CreateTemplateInput,
  ProfileBulkActionPayload,
  SettingsPayload,
  UpdateCloudPhoneInput,
  UpdateProfileInput,
  UpdateProxyInput,
  UpdateTemplateInput,
} from '../src/shared/types'

const api: DesktopApi = {
  auth: {
    getState: () => ipcRenderer.invoke('auth.getState'),
    login: (payload) => ipcRenderer.invoke('auth.login', payload),
    updateProfile: (payload) => ipcRenderer.invoke('auth.updateProfile', payload),
    uploadAvatar: () => ipcRenderer.invoke('auth.uploadAvatar'),
    changePassword: (payload) => ipcRenderer.invoke('auth.changePassword', payload),
    revokeDevice: (deviceId) => ipcRenderer.invoke('auth.revokeDevice', deviceId),
    deleteDevice: (deviceId) => ipcRenderer.invoke('auth.deleteDevice', deviceId),
    logout: () => ipcRenderer.invoke('auth.logout'),
    syncProfiles: () => ipcRenderer.invoke('auth.syncProfiles'),
  },
  meta: {
    getInfo: () => ipcRenderer.invoke('meta.getInfo'),
    getAgentState: () => ipcRenderer.invoke('meta.getAgentState'),
    onConfigChanged: (listener) => {
      const wrapped = () => {
        listener()
      }
      ipcRenderer.on('meta.configChanged', wrapped)
      return () => {
        ipcRenderer.removeListener('meta.configChanged', wrapped)
      }
    },
  },
  updater: {
    getState: () => ipcRenderer.invoke('updater.getState'),
    check: () => ipcRenderer.invoke('updater.check'),
    download: () => ipcRenderer.invoke('updater.download'),
    install: () => ipcRenderer.invoke('updater.install'),
    openReleasePage: () => ipcRenderer.invoke('updater.openReleasePage'),
    onStateChange: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        listener(payload as never)
      }
      ipcRenderer.on('updater.state', wrapped)
      return () => {
        ipcRenderer.removeListener('updater.state', wrapped)
      }
    },
  },
  dashboard: {
    summary: () => ipcRenderer.invoke('dashboard.summary'),
  },
  cloudPhones: {
    list: () => ipcRenderer.invoke('cloudPhones.list'),
    listProviders: () => ipcRenderer.invoke('cloudPhones.listProviders'),
    getProviderHealth: () => ipcRenderer.invoke('cloudPhones.getProviderHealth'),
    detectLocalDevices: () => ipcRenderer.invoke('cloudPhones.detectLocalDevices'),
    create: (input: CreateCloudPhoneInput) => ipcRenderer.invoke('cloudPhones.create', input),
    update: (input: UpdateCloudPhoneInput) => ipcRenderer.invoke('cloudPhones.update', input),
    delete: (id: string) => ipcRenderer.invoke('cloudPhones.delete', id),
    start: (id: string) => ipcRenderer.invoke('cloudPhones.start', id),
    stop: (id: string) => ipcRenderer.invoke('cloudPhones.stop', id),
    getStatus: (id: string) => ipcRenderer.invoke('cloudPhones.getStatus', id),
    getDetails: (id: string) => ipcRenderer.invoke('cloudPhones.getDetails', id),
    testProxy: (input: CreateCloudPhoneInput) => ipcRenderer.invoke('cloudPhones.testProxy', input),
    refreshStatuses: () => ipcRenderer.invoke('cloudPhones.refreshStatuses'),
    bulkStart: (payload: CloudPhoneBulkActionPayload) =>
      ipcRenderer.invoke('cloudPhones.bulkStart', payload),
    bulkStop: (payload: CloudPhoneBulkActionPayload) =>
      ipcRenderer.invoke('cloudPhones.bulkStop', payload),
    bulkDelete: (payload: CloudPhoneBulkActionPayload) =>
      ipcRenderer.invoke('cloudPhones.bulkDelete', payload),
    bulkAssignGroup: (payload: CloudPhoneBulkActionPayload) =>
      ipcRenderer.invoke('cloudPhones.bulkAssignGroup', payload),
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles.list'),
    create: (input: CreateProfileInput) => ipcRenderer.invoke('profiles.create', input),
    update: (input: UpdateProfileInput) => ipcRenderer.invoke('profiles.update', input),
    delete: (id: string) => ipcRenderer.invoke('profiles.delete', id),
    clone: (id: string) => ipcRenderer.invoke('profiles.clone', id),
    revealDirectory: (id: string) => ipcRenderer.invoke('profiles.revealDirectory', id),
    getDirectoryInfo: () => ipcRenderer.invoke('profiles.getDirectoryInfo'),
    bulkStart: (payload: ProfileBulkActionPayload) =>
      ipcRenderer.invoke('profiles.bulkStart', payload),
    bulkStop: (payload: ProfileBulkActionPayload) =>
      ipcRenderer.invoke('profiles.bulkStop', payload),
    bulkDelete: (payload: ProfileBulkActionPayload) =>
      ipcRenderer.invoke('profiles.bulkDelete', payload),
    bulkAssignGroup: (payload: ProfileBulkActionPayload) =>
      ipcRenderer.invoke('profiles.bulkAssignGroup', payload),
  },
  templates: {
    list: () => ipcRenderer.invoke('templates.list'),
    create: (input: CreateTemplateInput) => ipcRenderer.invoke('templates.create', input),
    update: (input: UpdateTemplateInput) => ipcRenderer.invoke('templates.update', input),
    delete: (id: string) => ipcRenderer.invoke('templates.delete', id),
    createFromProfile: (profileId: string) =>
      ipcRenderer.invoke('templates.createFromProfile', profileId),
  },
  proxies: {
    list: () => ipcRenderer.invoke('proxies.list'),
    create: (input: CreateProxyInput) => ipcRenderer.invoke('proxies.create', input),
    update: (input: UpdateProxyInput) => ipcRenderer.invoke('proxies.update', input),
    delete: (id: string) => ipcRenderer.invoke('proxies.delete', id),
    test: (id: string) => ipcRenderer.invoke('proxies.test', id),
  },
  runtime: {
    launch: (profileId: string) => ipcRenderer.invoke('runtime.launch', profileId),
    stop: (profileId: string) => ipcRenderer.invoke('runtime.stop', profileId),
    getStatus: () => ipcRenderer.invoke('runtime.getStatus'),
    getHostInfo: () => ipcRenderer.invoke('runtime.getHostInfo'),
  },
  workspace: {
    snapshots: {
      list: (profileId: string) => ipcRenderer.invoke('workspace.snapshots.list', profileId),
      create: (profileId: string) => ipcRenderer.invoke('workspace.snapshots.create', profileId),
      restore: (profileId: string, snapshotId: string) =>
        ipcRenderer.invoke('workspace.snapshots.restore', profileId, snapshotId),
      rollback: (profileId: string) => ipcRenderer.invoke('workspace.snapshots.rollback', profileId),
    },
  },
  logs: {
    list: () => ipcRenderer.invoke('logs.list'),
    clear: () => ipcRenderer.invoke('logs.clear'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings.get'),
    set: (payload: SettingsPayload) => ipcRenderer.invoke('settings.set', payload),
  },
  data: {
    exportBundle: () => ipcRenderer.invoke('data.exportBundle'),
    importBundle: () => ipcRenderer.invoke('data.importBundle'),
    previewBundle: () => ipcRenderer.invoke('data.previewBundle'),
  },
}

contextBridge.exposeInMainWorld('desktop', api)
