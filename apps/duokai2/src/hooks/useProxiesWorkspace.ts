import { useCallback, useState } from 'react'
import type { ProxyRecord, ProxyType } from '../shared/types'

type ProxyPanelMode = 'create' | 'edit'

type ProxyFormState = {
  name: string
  type: ProxyType
  host: string
  port: number
  username: string
  password: string
}

type ProxyRowFeedback = {
  kind: 'success' | 'error'
  message: string
}

function proxyRecordToForm(proxy: ProxyRecord): ProxyFormState {
  return {
    name: proxy.name,
    type: proxy.type,
    host: proxy.host,
    port: proxy.port,
    username: proxy.username,
    password: proxy.password,
  }
}

export function useProxiesWorkspace({
  proxies,
  emptyProxy,
}: {
  proxies: ProxyRecord[]
  emptyProxy: () => ProxyFormState
}) {
  const [selectedProxyId, setSelectedProxyId] = useState<string | null>(null)
  const [proxyPanelOpen, setProxyPanelOpen] = useState(false)
  const [proxyPanelMode, setProxyPanelMode] = useState<ProxyPanelMode>('create')
  const [testingProxyId, setTestingProxyId] = useState<string | null>(null)
  const [proxyRowFeedback, setProxyRowFeedback] = useState<Record<string, ProxyRowFeedback>>({})
  const [proxyForm, setProxyForm] = useState<ProxyFormState>(emptyProxy())

  const closeProxyPanel = useCallback(() => {
    setProxyPanelOpen(false)
    setProxyPanelMode('create')
    setSelectedProxyId(null)
    setProxyForm(emptyProxy())
  }, [emptyProxy])

  const resetProxyWorkspace = useCallback(() => {
    closeProxyPanel()
    setTestingProxyId(null)
    setProxyRowFeedback({})
  }, [closeProxyPanel])

  const openCreateProxyPanel = useCallback(() => {
    setSelectedProxyId(null)
    setProxyPanelMode('create')
    setProxyForm(emptyProxy())
    setProxyPanelOpen((current) => {
      if (!current) {
        return true
      }
      return proxyPanelMode === 'create' ? false : true
    })
  }, [emptyProxy, proxyPanelMode])

  const openEditProxyPanel = useCallback(
    (proxyId: string) => {
      const proxy = proxies.find((item) => item.id === proxyId)
      if (!proxy) {
        return
      }
      setSelectedProxyId(proxyId)
      setProxyPanelMode('edit')
      setProxyForm(proxyRecordToForm(proxy))
      setProxyPanelOpen(true)
    },
    [proxies],
  )

  return {
    selectedProxyId,
    proxyPanelOpen,
    proxyPanelMode,
    testingProxyId,
    setTestingProxyId,
    proxyRowFeedback,
    setProxyRowFeedback,
    proxyForm,
    setProxyForm,
    openCreateProxyPanel,
    openEditProxyPanel,
    closeProxyPanel,
    resetProxyWorkspace,
  }
}
