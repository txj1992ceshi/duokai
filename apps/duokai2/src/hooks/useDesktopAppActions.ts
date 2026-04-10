import type { FormEvent } from 'react'
import type { Dictionary, LocaleCode } from '../i18n'
import type {
  AccountPasswordFormState,
  AccountProfileFormState,
} from './useAccountWorkspace'
import type { DesktopApi } from '../shared/ipc'
import type { DesktopAuthState, DesktopUpdateState, SettingsPayload } from '../shared/types'

type RefreshAllOptions = {
  includeCloudPhoneDiagnostics?: boolean
}

export function useDesktopAppActions({
  locale,
  t,
  settings,
  authIdentifier,
  authPassword,
  authRememberCredentials,
  setAuthSubmitting,
  setAuthPassword,
  accountProfileForm,
  accountPasswordForm,
  resetAccountPasswordForm,
  currentDeviceId,
  requireDesktopApi,
  localizeError,
  setErrorMessage,
  setNoticeMessage,
  setSyncWarningMessage,
  setAuthState,
  setUpdateState,
  refreshAll,
  withBusy,
  clearAuthenticatedWorkspace,
  onCurrentDeviceSessionEnded,
}: {
  locale: LocaleCode
  t: Dictionary
  settings: SettingsPayload
  authIdentifier: string
  authPassword: string
  authRememberCredentials: boolean
  setAuthSubmitting: (value: boolean) => void
  setAuthPassword: (value: string) => void
  accountProfileForm: AccountProfileFormState
  accountPasswordForm: AccountPasswordFormState
  resetAccountPasswordForm: () => void
  currentDeviceId: string
  requireDesktopApi: (requiredPaths?: string[]) => DesktopApi
  localizeError: (error: unknown) => string
  setErrorMessage: (value: string) => void
  setNoticeMessage: (value: string) => void
  setSyncWarningMessage: (value: string) => void
  setAuthState: (value: DesktopAuthState | null) => void
  setUpdateState: (value: DesktopUpdateState | null) => void
  refreshAll: (options?: RefreshAllOptions) => Promise<void>
  withBusy: (message: string, action: () => Promise<void>) => Promise<void>
  clearAuthenticatedWorkspace: () => void
  onCurrentDeviceSessionEnded: () => void
}) {
  const copy =
    locale === 'zh-CN'
      ? {
          latestVersion: '当前已是最新版本。',
          settingsSaved: '设置已保存。',
          updatingAccountProfile: '正在更新个人资料...',
          emailOrUsernameRequired: '邮箱和账号至少需要保留一个。',
          accountProfileUpdated: '个人资料已更新。',
          changingPassword: '正在修改密码...',
          currentAndNewPasswordRequired: '请输入当前密码和新密码。',
          newPasswordTooShort: '新密码至少需要 6 位。',
          passwordConfirmationMismatch: '两次输入的新密码不一致。',
          passwordChanged: '密码已修改。',
          uploadingAvatar: '正在上传头像...',
          avatarUpdated: '头像已更新。',
          confirmRevokeCurrent: '确认踢下当前设备吗？执行后当前桌面端会立即退出登录。',
          confirmRevokeOther: '确认踢下这个设备吗？',
          revokingDevice: '正在踢下线设备...',
          currentDeviceRevoked: '当前设备已被踢下线，请重新登录。',
          deviceRevoked: '设备已踢下线。',
          confirmDeleteCurrent: '确认删除当前设备吗？执行后当前桌面端会立即退出登录。',
          confirmDeleteOther: '确认删除这个设备吗？删除后该设备记录会被移除。',
          deletingDevice: '正在删除设备...',
          currentDeviceDeleted: '当前设备已删除，请重新登录。',
          deviceDeleted: '设备已删除。',
          syncingEnvironmentConfig: '正在从云端刷新环境数据...',
          environmentConfigSynced: '已从云端更新环境数据。',
        }
      : {
          latestVersion: 'You already have the latest version.',
          settingsSaved: 'Settings saved.',
          updatingAccountProfile: 'Updating account profile...',
          emailOrUsernameRequired: 'Email or username is required.',
          accountProfileUpdated: 'Account profile updated.',
          changingPassword: 'Changing password...',
          currentAndNewPasswordRequired: 'Current password and new password are required.',
          newPasswordTooShort: 'New password must be at least 6 characters.',
          passwordConfirmationMismatch: 'Password confirmation does not match.',
          passwordChanged: 'Password changed successfully.',
          uploadingAvatar: 'Uploading avatar...',
          avatarUpdated: 'Avatar updated.',
          confirmRevokeCurrent: 'Revoke current device? This desktop app will be logged out immediately.',
          confirmRevokeOther: 'Revoke this device?',
          revokingDevice: 'Revoking device...',
          currentDeviceRevoked: 'Current device was revoked. Please log in again.',
          deviceRevoked: 'Device revoked.',
          confirmDeleteCurrent: 'Delete current device? This desktop app will be logged out immediately.',
          confirmDeleteOther: 'Delete this device? Its record will be removed.',
          deletingDevice: 'Deleting device...',
          currentDeviceDeleted: 'Current device was deleted. Please log in again.',
          deviceDeleted: 'Device deleted.',
          syncingEnvironmentConfig: 'Refreshing environment data from cloud...',
          environmentConfigSynced: 'Environment data updated from cloud.',
        }

  function applyConfigSyncFeedback(authState: DesktopAuthState | null) {
    const result = authState?.lastConfigSyncResult
    if (!result) {
      return
    }
    if (result.usedLocalCache) {
      setSyncWarningMessage(result.warningMessage)
      return
    }
    setSyncWarningMessage('')
    if (result.message) {
      setNoticeMessage(result.message || copy.environmentConfigSynced)
    }
  }

  async function checkForUpdates(manual = true) {
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['updater.check'])
      const nextState = await api.updater.check()
      setUpdateState(nextState)
      if (manual && nextState.status === 'not-available') {
        setNoticeMessage(copy.latestVersion)
      }
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function downloadUpdate() {
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['updater.download'])
      const nextState = await api.updater.download()
      setUpdateState(nextState)
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function installUpdate() {
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['updater.install'])
      const result = await api.updater.install()
      setNoticeMessage(result.message)
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function openReleasePage() {
    try {
      const api = requireDesktopApi(['updater.openReleasePage'])
      await api.updater.openReleasePage()
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function handlePrimaryUpdateAction(state: DesktopUpdateState | null) {
    if (state?.status === 'available') {
      await downloadUpdate()
      return
    }
    if (state?.status === 'downloaded') {
      await installUpdate()
      return
    }
    if (state?.status === 'downloading') {
      return
    }
    await checkForUpdates(true)
  }

  async function saveSettings() {
    await withBusy(t.busy.saveSettings, async () => {
      const api = requireDesktopApi(['settings.set'])
      await api.settings.set(settings)
      setNoticeMessage(copy.settingsSaved)
    })
  }

  async function handleDesktopLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthSubmitting(true)
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['auth.login'])
      const nextAuthState = await api.auth.login({
        identifier: authIdentifier,
        password: authPassword,
        rememberCredentials: authRememberCredentials,
      })
      setAuthState(nextAuthState)
      setAuthPassword('')
      applyConfigSyncFeedback(nextAuthState)
      await refreshAll({ includeCloudPhoneDiagnostics: true })
    } catch (error) {
      setErrorMessage(localizeError(error))
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleDesktopLogout() {
    try {
      const api = requireDesktopApi(['auth.logout'])
      const nextAuthState = await api.auth.logout()
      setAuthState(nextAuthState)
      clearAuthenticatedWorkspace()
      setSyncWarningMessage('')
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function syncEnvironmentConfig() {
    await withBusy(copy.syncingEnvironmentConfig, async () => {
      const api = requireDesktopApi(['auth.syncConfig'])
      const result = await api.auth.syncConfig()
      if (result.usedLocalCache) {
        setSyncWarningMessage(result.warningMessage)
      } else {
        setSyncWarningMessage('')
        setNoticeMessage(result.message || copy.environmentConfigSynced)
      }
      const authApi = requireDesktopApi(['auth.getState'])
      const nextAuthState = await authApi.auth.getState()
      setAuthState(nextAuthState)
      await refreshAll({ includeCloudPhoneDiagnostics: true })
    })
  }

  async function saveAccountProfile() {
    await withBusy(copy.updatingAccountProfile, async () => {
      if (!accountProfileForm.email.trim() && !accountProfileForm.username.trim()) {
        throw new Error(`VALIDATION:${copy.emailOrUsernameRequired}`)
      }
      const api = requireDesktopApi(['auth.updateProfile'])
      const nextAuthState = await api.auth.updateProfile({
        name: accountProfileForm.name.trim(),
        email: accountProfileForm.email.trim(),
        username: accountProfileForm.username.trim(),
        avatarUrl: accountProfileForm.avatarUrl.trim(),
        bio: accountProfileForm.bio.trim(),
      })
      setAuthState(nextAuthState)
      setNoticeMessage(copy.accountProfileUpdated)
    })
  }

  async function saveAccountPassword() {
    await withBusy(copy.changingPassword, async () => {
      if (!accountPasswordForm.currentPassword || !accountPasswordForm.nextPassword) {
        throw new Error(`VALIDATION:${copy.currentAndNewPasswordRequired}`)
      }
      if (accountPasswordForm.nextPassword.length < 6) {
        throw new Error(`VALIDATION:${copy.newPasswordTooShort}`)
      }
      if (accountPasswordForm.nextPassword !== accountPasswordForm.confirmPassword) {
        throw new Error(`VALIDATION:${copy.passwordConfirmationMismatch}`)
      }
      const api = requireDesktopApi(['auth.changePassword'])
      await api.auth.changePassword({
        currentPassword: accountPasswordForm.currentPassword,
        nextPassword: accountPasswordForm.nextPassword,
      })
      resetAccountPasswordForm()
      setNoticeMessage(copy.passwordChanged)
    })
  }

  async function uploadAccountAvatar() {
    await withBusy(copy.uploadingAvatar, async () => {
      const api = requireDesktopApi(['auth.uploadAvatar'])
      const nextAuthState = await api.auth.uploadAvatar()
      setAuthState(nextAuthState)
      setNoticeMessage(copy.avatarUpdated)
    })
  }

  async function revokeAccountDevice(deviceId: string) {
    const confirmMessage =
      deviceId === currentDeviceId ? copy.confirmRevokeCurrent : copy.confirmRevokeOther
    if (!window.confirm(confirmMessage)) {
      return
    }
    await withBusy(copy.revokingDevice, async () => {
      const api = requireDesktopApi(['auth.revokeDevice'])
      const nextAuthState = await api.auth.revokeDevice(deviceId)
      setAuthState(nextAuthState)
      if (deviceId === currentDeviceId) {
        clearAuthenticatedWorkspace()
        onCurrentDeviceSessionEnded()
        setNoticeMessage(copy.currentDeviceRevoked)
        return
      }
      setNoticeMessage(copy.deviceRevoked)
    })
  }

  async function deleteAccountDevice(deviceId: string) {
    const confirmMessage =
      deviceId === currentDeviceId ? copy.confirmDeleteCurrent : copy.confirmDeleteOther
    if (!window.confirm(confirmMessage)) {
      return
    }
    await withBusy(copy.deletingDevice, async () => {
      const api = requireDesktopApi(['auth.deleteDevice'])
      const nextAuthState = await api.auth.deleteDevice(deviceId)
      setAuthState(nextAuthState)
      if (deviceId === currentDeviceId) {
        clearAuthenticatedWorkspace()
        onCurrentDeviceSessionEnded()
        setNoticeMessage(copy.currentDeviceDeleted)
        return
      }
      setNoticeMessage(copy.deviceDeleted)
    })
  }

  return {
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    openReleasePage,
    handlePrimaryUpdateAction,
    saveSettings,
    handleDesktopLogin,
    handleDesktopLogout,
    saveAccountProfile,
    saveAccountPassword,
    uploadAccountAvatar,
    syncEnvironmentConfig,
    revokeAccountDevice,
    deleteAccountDevice,
  }
}
