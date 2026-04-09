import { useRef, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react'
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
import type { Dictionary } from '../i18n'
import i18nClient from '../lib/i18n-client'
import type { ProxyRecord, ProxyType } from '../shared/types'
import { EmptyState } from './feedback/EmptyState'

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

export function ProxiesView({
  locale,
  t,
  proxies,
  proxyRowFeedback,
  testingProxyId,
  proxyPanelOpen,
  proxyPanelMode,
  selectedProxyId,
  proxyForm,
  setProxyForm,
  onOpenCreate,
  onOpenEdit,
  onClosePanel,
  onSave,
  onDelete,
  onTest,
}: {
  locale: string
  t: Dictionary
  proxies: ProxyRecord[]
  proxyRowFeedback: Record<string, ProxyRowFeedback>
  testingProxyId: string | null
  proxyPanelOpen: boolean
  proxyPanelMode: ProxyPanelMode
  selectedProxyId: string | null
  proxyForm: ProxyFormState
  setProxyForm: Dispatch<SetStateAction<ProxyFormState>>
  onOpenCreate: () => void
  onOpenEdit: (proxyId: string) => void
  onClosePanel: () => void
  onSave: () => void
  onDelete: () => void
  onTest: (proxyId: string) => void
}) {
  const pointerActionRef = useRef<string | null>(null)
  const desktopT = i18nClient.getFixedT(locale, 'desktop')

  function bindPointerAction(actionKey: string, action: () => void) {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) {
          return
        }
        pointerActionRef.current = actionKey
        event.preventDefault()
        action()
      },
      onClick: () => {
        if (pointerActionRef.current === actionKey) {
          pointerActionRef.current = null
          return
        }
        action()
      },
    }
  }

  return (
    <section className="space-y-6">
      <Card className="rounded-[28px] border border-slate-200 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="m-0 text-xl font-semibold text-slate-950">{t.proxies.title}</h2>
            <p className="mt-1 mb-0 text-sm text-slate-500">
              {desktopT('proxies.description')}
            </p>
          </div>
          <Button variant="primary" onClick={onOpenCreate}>
            {proxyPanelOpen && proxyPanelMode === 'create'
              ? desktopT('proxies.closeCreate')
              : t.proxies.newProxy}
          </Button>
        </div>
      </Card>

      {!proxyPanelOpen && proxies.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {proxies.map((proxy) => (
            <Card key={proxy.id} className="rounded-[24px] border border-slate-200 shadow-none">
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-slate-950">{proxy.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {proxy.type.toUpperCase()} {proxy.host}:{proxy.port}
                    </div>
                  </div>
                  <Badge
                    tone={
                      proxy.status === 'online'
                        ? 'success'
                        : proxy.status === 'offline'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {proxy.status === 'online'
                      ? desktopT('proxies.status.online')
                      : proxy.status === 'offline'
                        ? desktopT('proxies.status.offline')
                        : desktopT('proxies.status.unknown')}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {proxy.username ? <Badge tone="neutral">{proxy.username}</Badge> : null}
                  {proxyRowFeedback[proxy.id] ? (
                    <Badge tone={proxyRowFeedback[proxy.id].kind === 'success' ? 'success' : 'danger'}>
                      {proxyRowFeedback[proxy.id].message}
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" onClick={() => onOpenEdit(proxy.id)}>
                    {t.common.edit}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={testingProxyId === proxy.id}
                    onClick={() => onTest(proxy.id)}
                  >
                    {testingProxyId === proxy.id
                      ? desktopT('proxies.testing')
                      : t.common.test}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : !proxyPanelOpen ? (
        <EmptyState
          title={desktopT('proxies.emptyTitle')}
          description={t.proxies.empty}
          actionLabel={t.proxies.newProxy}
          onAction={onOpenCreate}
        />
      ) : null}

      <Sheet open={proxyPanelOpen}>
        <SheetOverlay onClick={onClosePanel} />
        <SheetContent className="max-w-[420px]">
          <SheetHeader>
            <SheetTitle>{proxyPanelMode === 'edit' ? t.proxies.editProxy : t.proxies.createProxy}</SheetTitle>
          </SheetHeader>

          <div className="duokai-scrollbar flex-1 overflow-y-auto p-5">
            <div className="space-y-4">
              <Input
                value={proxyForm.name}
                onChange={(event) => setProxyForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={t.proxies.name}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  value={proxyForm.type}
                  onChange={(event) =>
                    setProxyForm((current) => ({
                      ...current,
                      type: event.target.value as ProxyType,
                    }))
                  }
                >
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="socks5">SOCKS5</option>
                </Select>
                <Input
                  type="number"
                  value={proxyForm.port}
                  onChange={(event) =>
                    setProxyForm((current) => ({
                      ...current,
                      port: Number(event.target.value),
                    }))
                  }
                  placeholder={t.proxies.port}
                />
              </div>
              <Input
                value={proxyForm.host}
                onChange={(event) => setProxyForm((current) => ({ ...current, host: event.target.value }))}
                placeholder={t.proxies.host}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  value={proxyForm.username}
                  onChange={(event) =>
                    setProxyForm((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder={t.proxies.username}
                />
                <Input
                  type="password"
                  value={proxyForm.password}
                  onChange={(event) =>
                    setProxyForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder={t.proxies.password}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <Button variant="ghost" {...bindPointerAction('close-proxy-panel', onClosePanel)}>
              {desktopT('proxies.close')}
            </Button>
            <div className="flex items-center gap-2">
              {proxyPanelMode === 'edit' && selectedProxyId ? (
                <Button variant="danger" {...bindPointerAction('delete-proxy', onDelete)}>
                  {t.proxies.deleteProxy}
                </Button>
              ) : null}
              <Button variant="primary" {...bindPointerAction('save-proxy', onSave)}>
                {proxyPanelMode === 'edit' ? t.proxies.updateProxy : t.proxies.createProxy}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
