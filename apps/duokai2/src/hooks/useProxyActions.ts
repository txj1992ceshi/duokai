import type { Dictionary, LocaleCode } from '../i18n'
import type { DesktopApi } from '../shared/ipc'
import type { ProxyType } from '../shared/types'

type ProxyFormState = {
  name: string
  type: ProxyType
  host: string
  port: number
  username: string
  password: string
}

type ProxyRowFeedback = Record<
  string,
  {
    kind: 'success' | 'error'
    message: string
  }
>

type RefreshAllOptions = {
  includeCloudPhoneDiagnostics?: boolean
}

export function useProxyActions({
  locale,
  t,
  proxyForm,
  selectedProxyId,
  closeProxyPanel,
  requireDesktopApi,
  localizeError,
  setErrorMessage,
  setNoticeMessage,
  setTestingProxyId,
  setProxyRowFeedback,
  refreshAll,
  withBusy,
}: {
  locale: LocaleCode
  t: Dictionary
  proxyForm: ProxyFormState
  selectedProxyId: string | null
  closeProxyPanel: () => void
  requireDesktopApi: (requiredPaths?: string[]) => DesktopApi
  localizeError: (error: unknown) => string
  setErrorMessage: (value: string) => void
  setNoticeMessage: (value: string) => void
  setTestingProxyId: (value: string | null) => void
  setProxyRowFeedback: (
    value: ProxyRowFeedback | ((current: ProxyRowFeedback) => ProxyRowFeedback),
  ) => void
  refreshAll: (options?: RefreshAllOptions) => Promise<void>
  withBusy: (message: string, action: () => Promise<void>) => Promise<void>
}) {
  const copy =
    locale === 'zh-CN'
      ? {
          proxyNameRequired: '代理名称不能为空。',
          proxyHostRequired: '代理主机不能为空。',
          proxyPortRequired: '代理端口必须大于 0。',
          proxySaved: '代理已保存，列表已刷新。',
          testPassed: '测试通过',
          testFailed: (message: string) => `测试失败：${message}`,
          proxyDeleted: '代理已删除。',
        }
      : {
          proxyNameRequired: 'Proxy name is required.',
          proxyHostRequired: 'Proxy host is required.',
          proxyPortRequired: 'Proxy port must be greater than 0.',
          proxySaved: 'Proxy saved and list refreshed.',
          testPassed: 'Passed',
          testFailed: (message: string) => `Failed: ${message}`,
          proxyDeleted: 'Proxy deleted.',
        }

  async function saveProxy() {
    await withBusy(
      selectedProxyId ? t.busy.updateProxy : t.busy.createProxy,
      async () => {
        if (proxyForm.name.trim().length === 0) {
          throw new Error(`VALIDATION:${copy.proxyNameRequired}`)
        }
        if (proxyForm.host.trim().length === 0) {
          throw new Error(`VALIDATION:${copy.proxyHostRequired}`)
        }
        if (!Number.isFinite(Number(proxyForm.port)) || Number(proxyForm.port) <= 0) {
          throw new Error(`VALIDATION:${copy.proxyPortRequired}`)
        }
        const api = requireDesktopApi(['proxies.create', 'proxies.update'])
        const payload = { ...proxyForm, port: Number(proxyForm.port) }
        if (selectedProxyId) {
          await api.proxies.update({ id: selectedProxyId, ...payload })
        } else {
          await api.proxies.create(payload)
        }
        closeProxyPanel()
        setNoticeMessage(copy.proxySaved)
      },
    )
  }

  async function testProxy(proxyId: string) {
    setTestingProxyId(proxyId)
    setErrorMessage('')
    setNoticeMessage('')
    setProxyRowFeedback((current) => {
      const next = { ...current }
      delete next[proxyId]
      return next
    })
    try {
      const api = requireDesktopApi(['proxies.test'])
      const result = await api.proxies.test(proxyId)
      if (!result.success) {
        setProxyRowFeedback((current) => ({
          ...current,
          [proxyId]: {
            kind: 'error',
            message: copy.testFailed(result.message || 'Unknown proxy error'),
          },
        }))
        return
      }
      setProxyRowFeedback((current) => ({
        ...current,
        [proxyId]: {
          kind: 'success',
          message: result.message || copy.testPassed,
        },
      }))
    } catch (error) {
      const message = localizeError(error)
      setProxyRowFeedback((current) => ({
        ...current,
        [proxyId]: {
          kind: 'error',
          message: copy.testFailed(message),
        },
      }))
    } finally {
      setTestingProxyId(null)
      window.setTimeout(() => {
        setProxyRowFeedback((current) => {
          const next = { ...current }
          delete next[proxyId]
          return next
        })
      }, 3000)
      await refreshAll()
    }
  }

  async function deleteSelectedProxy() {
    await withBusy(t.busy.deleteProxy, async () => {
      if (!selectedProxyId) {
        return
      }
      const api = requireDesktopApi(['proxies.delete'])
      await api.proxies.delete(selectedProxyId)
      closeProxyPanel()
      setNoticeMessage(copy.proxyDeleted)
    })
  }

  return {
    saveProxy,
    testProxy,
    deleteSelectedProxy,
  }
}
