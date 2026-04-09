import { useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react'
import {
  Button,
  Input,
  ScrollArea,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@duokai/ui'
import type { Dictionary } from '../../i18n'
import { SUPPORTED_ENVIRONMENT_LANGUAGES } from '../../shared/environmentLanguages'
import type { EnvironmentPurpose, ProxyRecord } from '../../shared/types'
import type { ProfileFormState } from '../../lib/desktop-types'

const PURPOSE_OPTIONS: Array<{ value: EnvironmentPurpose; zh: string; en: string }> = [
  { value: 'operation', zh: '日常运营', en: 'Operation' },
  { value: 'nurture', zh: '养号维护', en: 'Nurture' },
  { value: 'register', zh: '注册环境', en: 'Register' },
]

export function ProfileDrawer({
  open,
  locale,
  title,
  description,
  activeTab,
  onTabChange,
  profileForm,
  setProfileForm,
  proxies,
  selectedProfileId,
  defaultEnvironmentLanguage,
  t,
  onClose,
  onSave,
  onDelete,
  onRevealFolder,
  onSaveAsTemplate,
  onRandomizeFingerprint,
}: {
  open: boolean
  locale: string
  title: string
  description: string
  activeTab: 'hardware' | 'network' | 'fingerprint'
  onTabChange: (tab: 'hardware' | 'network' | 'fingerprint') => void
  profileForm: ProfileFormState
  setProfileForm: Dispatch<SetStateAction<ProfileFormState>>
  proxies: ProxyRecord[]
  selectedProfileId: string | null
  defaultEnvironmentLanguage: string
  t: Dictionary
  onClose: () => void
  onSave: () => void | Promise<void>
  onDelete: () => void | Promise<void>
  onRevealFolder?: (() => void | Promise<void>) | null
  onSaveAsTemplate?: (() => void | Promise<void>) | null
  onRandomizeFingerprint: () => void
}) {
  const pointerActionRef = useRef<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const isZh = locale === 'zh-CN'
  const copy = isZh
    ? {
        tabs: {
          hardware: '硬件',
          network: '网络',
          fingerprint: '指纹',
        },
        environmentPurpose: '环境用途',
        operatingSystem: '操作系统',
        chromeVersion: 'Chrome 版本',
        windowSize: '窗口尺寸',
        cpuAndMemory: 'CPU / 内存',
        webglRenderer: 'WebGL 渲染器',
        proxyMode: '代理模式',
        proxyModes: {
          direct: '直连',
          manager: '代理管理',
          custom: '自定义代理',
        },
        selectProxy: '请选择代理',
        host: '主机',
        port: '端口',
        autoFromIp: '基于 IP 自动生成',
        manual: '手动设置',
        geolocation: '地理位置',
        quickFingerprint: '快速指纹扰动',
        quickFingerprintDescription: '随机化桌面尺寸、UA 与部分硬件参数',
        randomize: '随机化',
        platform: '平台',
        selectPlatform: '请选择',
        custom: '自定义',
        webrtcDefault: '默认',
        webrtcDisabled: '禁用',
        platformName: '平台名称',
        platformUrl: '平台 URL',
        canvasRandom: '随机',
        canvasOff: '关闭',
        canvasCustom: '自定义',
        deviceName: '设备名称',
        launchArgs: '启动参数',
        cancel: '取消',
      }
    : {
        tabs: {
          hardware: 'Hardware',
          network: 'Network',
          fingerprint: 'Fingerprint',
        },
        environmentPurpose: 'Environment purpose',
        operatingSystem: 'Operating system',
        chromeVersion: 'Chrome version',
        windowSize: 'Window size',
        cpuAndMemory: 'CPU / Memory',
        webglRenderer: 'WebGL renderer',
        proxyMode: 'Proxy mode',
        proxyModes: {
          direct: 'Direct',
          manager: 'Managed proxy',
          custom: 'Custom proxy',
        },
        selectProxy: 'Select proxy',
        host: 'Host',
        port: 'Port',
        autoFromIp: 'Generate from IP',
        manual: 'Manual',
        geolocation: 'Geolocation',
        quickFingerprint: 'Quick fingerprint shuffle',
        quickFingerprintDescription: 'Randomize desktop size, user agent, and selected hardware traits',
        randomize: 'Randomize',
        platform: 'Platform',
        selectPlatform: 'Select',
        custom: 'Custom',
        webrtcDefault: 'Default',
        webrtcDisabled: 'Disabled',
        platformName: 'Platform name',
        platformUrl: 'Platform URL',
        canvasRandom: 'Random',
        canvasOff: 'Off',
        canvasCustom: 'Custom',
        deviceName: 'Device name',
        launchArgs: 'Launch arguments',
        cancel: 'Cancel',
      }

  const saveButtonLabel =
    saveState === 'saving'
      ? selectedProfileId
        ? isZh
          ? '更新中...'
          : 'Updating...'
        : isZh
          ? '创建中...'
          : 'Creating...'
      : saveState === 'success'
        ? selectedProfileId
          ? isZh
            ? '更新成功'
            : 'Updated'
          : isZh
            ? '创建成功'
            : 'Created'
        : saveState === 'error'
          ? selectedProfileId
            ? isZh
              ? '更新失败'
              : 'Update failed'
            : isZh
              ? '创建失败'
              : 'Create failed'
          : selectedProfileId
            ? t.profiles.updateProfile
            : t.profiles.createProfile

  function bindPointerAction(actionKey: string, action: () => void | Promise<void>) {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) {
          return
        }
        pointerActionRef.current = actionKey
        event.preventDefault()
        void action()
      },
      onClick: () => {
        if (pointerActionRef.current === actionKey) {
          pointerActionRef.current = null
          return
        }
        void action()
      },
    }
  }

  async function handleSaveAction() {
    setSaveState('saving')
    try {
      await onSave()
      setSaveState('success')
    } catch {
      setSaveState('error')
    }
  }

  return (
    <Sheet open={open}>
      <SheetOverlay onClick={onClose} />
      <SheetContent data-duokai-pause-polling="true">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="border-b border-slate-200 px-5 py-4">
          <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="hardware">{copy.tabs.hardware}</TabsTrigger>
              <TabsTrigger value="network">{copy.tabs.network}</TabsTrigger>
              <TabsTrigger value="fingerprint">{copy.tabs.fingerprint}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-5 py-4">
          <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as typeof activeTab)}>
            <TabsContent value="hardware" className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{copy.environmentPurpose}</span>
                <Select
                  value={profileForm.environmentPurpose}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      environmentPurpose: event.target.value as EnvironmentPurpose,
                    }))
                  }
                >
                  {PURPOSE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {isZh ? option.zh : option.en}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{t.profiles.name}</span>
                <Input
                  value={profileForm.name}
                  maxLength={50}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t.profiles.group}</span>
                  <Input
                    value={profileForm.groupName}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, groupName: event.target.value }))
                    }
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t.profiles.tags}</span>
                  <Input
                    value={profileForm.tagsText}
                    placeholder={t.profiles.tagsPlaceholder}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, tagsText: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.operatingSystem}</span>
                  <Input
                    value={profileForm.fingerprintConfig.advanced.operatingSystem}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            operatingSystem: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.chromeVersion}</span>
                  <Input
                    value={profileForm.fingerprintConfig.advanced.browserVersion}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            browserVersion: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.windowSize}</span>
                  <Input
                    value={`${profileForm.fingerprintConfig.advanced.windowWidth}x${profileForm.fingerprintConfig.advanced.windowHeight}`}
                    onChange={(event) => {
                      const [widthText, heightText] = event.target.value.split(/x|×/i).map((part) => part.trim())
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            windowWidth: Number(widthText) || current.fingerprintConfig.advanced.windowWidth,
                            windowHeight: Number(heightText) || current.fingerprintConfig.advanced.windowHeight,
                          },
                        },
                      }))
                    }}
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.cpuAndMemory}</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      value={profileForm.fingerprintConfig.advanced.cpuCores}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            advanced: {
                              ...current.fingerprintConfig.advanced,
                              cpuCores: Number(event.target.value) || current.fingerprintConfig.advanced.cpuCores,
                            },
                          },
                        }))
                      }
                    />
                    <Input
                      type="number"
                      value={profileForm.fingerprintConfig.advanced.memoryGb}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            advanced: {
                              ...current.fingerprintConfig.advanced,
                              memoryGb: Number(event.target.value) || current.fingerprintConfig.advanced.memoryGb,
                            },
                          },
                        }))
                      }
                    />
                  </div>
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{copy.webglRenderer}</span>
                <Input
                  value={profileForm.fingerprintConfig.advanced.webglRenderer}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      fingerprintConfig: {
                        ...current.fingerprintConfig,
                        advanced: {
                          ...current.fingerprintConfig.advanced,
                          webglRenderer: event.target.value,
                        },
                      },
                    }))
                  }
                />
              </label>
            </TabsContent>

            <TabsContent value="network" className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{copy.proxyMode}</span>
                <Select
                  value={profileForm.fingerprintConfig.proxySettings.proxyMode}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      fingerprintConfig: {
                        ...current.fingerprintConfig,
                        proxySettings: {
                          ...current.fingerprintConfig.proxySettings,
                          proxyMode: event.target.value as typeof current.fingerprintConfig.proxySettings.proxyMode,
                        },
                      },
                    }))
                  }
                >
                  <option value="direct">{copy.proxyModes.direct}</option>
                  <option value="manager">{copy.proxyModes.manager}</option>
                  <option value="custom">{copy.proxyModes.custom}</option>
                </Select>
              </label>
              {profileForm.fingerprintConfig.proxySettings.proxyMode === 'manager' ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t.profiles.proxy}</span>
                  <Select
                    value={profileForm.proxyId || ''}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, proxyId: event.target.value || null }))
                    }
                  >
                    <option value="">{copy.selectProxy}</option>
                    {proxies.map((proxy) => (
                      <option key={proxy.id} value={proxy.id}>
                        {proxy.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              {profileForm.fingerprintConfig.proxySettings.proxyMode === 'custom' ? (
                <div className="grid grid-cols-2 gap-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">{copy.host}</span>
                    <Input
                      value={profileForm.fingerprintConfig.proxySettings.host}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            proxySettings: {
                              ...current.fingerprintConfig.proxySettings,
                              host: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">{copy.port}</span>
                    <Input
                      type="number"
                      value={profileForm.fingerprintConfig.proxySettings.port || ''}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            proxySettings: {
                              ...current.fingerprintConfig.proxySettings,
                              port: Number(event.target.value),
                            },
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t.profiles.language}</span>
                  <Select
                    value={profileForm.fingerprintConfig.advanced.autoLanguageFromIp ? 'auto' : 'manual'}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            autoLanguageFromIp: event.target.value === 'auto',
                          },
                        },
                      }))
                    }
                  >
                    <option value="auto">{copy.autoFromIp}</option>
                    <option value="manual">{copy.manual}</option>
                  </Select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t.profiles.timezone}</span>
                  <Select
                    value={profileForm.fingerprintConfig.advanced.autoTimezoneFromIp ? 'auto' : 'manual'}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            autoTimezoneFromIp: event.target.value === 'auto',
                          },
                        },
                      }))
                    }
                  >
                    <option value="auto">{copy.autoFromIp}</option>
                    <option value="manual">{copy.manual}</option>
                  </Select>
                </label>
              </div>
              {!profileForm.fingerprintConfig.advanced.autoLanguageFromIp ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t.profiles.language}</span>
                  <Select
                    value={profileForm.fingerprintConfig.language || defaultEnvironmentLanguage}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          language: event.target.value,
                        },
                      }))
                    }
                  >
                    {SUPPORTED_ENVIRONMENT_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {t.common.envLanguageLabel(code)}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              {!profileForm.fingerprintConfig.advanced.autoTimezoneFromIp ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t.profiles.timezone}</span>
                  <Input
                    value={profileForm.fingerprintConfig.timezone}
                    placeholder="America/Los_Angeles"
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          timezone: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              ) : null}
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{copy.geolocation}</span>
                <Input
                  value={profileForm.fingerprintConfig.advanced.geolocation}
                  placeholder="34.0522, -118.2437"
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      fingerprintConfig: {
                        ...current.fingerprintConfig,
                        advanced: {
                          ...current.fingerprintConfig.advanced,
                          geolocation: event.target.value,
                          autoGeolocationFromIp: false,
                        },
                      },
                    }))
                  }
                />
              </label>
            </TabsContent>

            <TabsContent value="fingerprint" className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-slate-800">{copy.quickFingerprint}</div>
                  <div className="text-xs text-slate-500">{copy.quickFingerprintDescription}</div>
                </div>
                <Button variant="secondary" size="sm" onClick={onRandomizeFingerprint}>
                  {copy.randomize}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.platform}</span>
                  <Select
                    value={profileForm.fingerprintConfig.basicSettings.platform}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          basicSettings: {
                            ...current.fingerprintConfig.basicSettings,
                            platform: event.target.value,
                          },
                        },
                      }))
                    }
                  >
                    <option value="">{copy.selectPlatform}</option>
                    <option value="amazon">Amazon</option>
                    <option value="tiktok">TikTok</option>
                    <option value="google">Google</option>
                    <option value="facebook">Facebook</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="instagram">Instagram</option>
                    <option value="x">X</option>
                    <option value="youtube">YouTube</option>
                    <option value="custom">{copy.custom}</option>
                  </Select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t.profiles.webrtc}</span>
                  <Select
                    value={profileForm.fingerprintConfig.webrtcMode}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          webrtcMode: event.target.value as typeof current.fingerprintConfig.webrtcMode,
                        },
                      }))
                    }
                  >
                    <option value="default">{copy.webrtcDefault}</option>
                    <option value="disabled">{copy.webrtcDisabled}</option>
                  </Select>
                </label>
              </div>
              {profileForm.fingerprintConfig.basicSettings.platform === 'custom' ? (
                <div className="grid grid-cols-2 gap-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">{copy.platformName}</span>
                    <Input
                      value={profileForm.fingerprintConfig.basicSettings.customPlatformName}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            basicSettings: {
                              ...current.fingerprintConfig.basicSettings,
                              customPlatformName: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">{copy.platformUrl}</span>
                    <Input
                      value={profileForm.fingerprintConfig.basicSettings.customPlatformUrl}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            basicSettings: {
                              ...current.fingerprintConfig.basicSettings,
                              customPlatformUrl: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{t.profiles.userAgent}</span>
                <Textarea
                  rows={4}
                  value={profileForm.fingerprintConfig.userAgent}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      fingerprintConfig: {
                        ...current.fingerprintConfig,
                        userAgent: event.target.value,
                      },
                    }))
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Canvas</span>
                  <Select
                    value={profileForm.fingerprintConfig.advanced.canvasMode}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            canvasMode: event.target.value as typeof current.fingerprintConfig.advanced.canvasMode,
                          },
                        },
                      }))
                    }
                  >
                    <option value="random">{copy.canvasRandom}</option>
                    <option value="off">{copy.canvasOff}</option>
                    <option value="custom">{copy.canvasCustom}</option>
                  </Select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">WebGL</span>
                  <Select
                    value={profileForm.fingerprintConfig.advanced.webglImageMode}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            webglImageMode: event.target.value as typeof current.fingerprintConfig.advanced.webglImageMode,
                          },
                        },
                      }))
                    }
                  >
                    <option value="random">{copy.canvasRandom}</option>
                    <option value="off">{copy.canvasOff}</option>
                    <option value="custom">{copy.canvasCustom}</option>
                  </Select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.deviceName}</span>
                  <Input
                    value={profileForm.fingerprintConfig.advanced.deviceName}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            deviceName: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Host IP</span>
                  <Input
                    value={profileForm.fingerprintConfig.advanced.hostIp}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            hostIp: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">MAC</span>
                  <Input
                    value={profileForm.fingerprintConfig.advanced.macAddress}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            macAddress: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.launchArgs}</span>
                  <Input
                    value={profileForm.fingerprintConfig.advanced.launchArgs}
                    placeholder="--mute-audio,--disable-extensions"
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            launchArgs: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{t.profiles.notes}</span>
                <Textarea
                  rows={4}
                  value={profileForm.notes}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
            </TabsContent>
          </Tabs>
        </ScrollArea>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {selectedProfileId && onRevealFolder ? (
              <Button variant="ghost" size="sm" onClick={onRevealFolder}>
                {t.profiles.revealFolder}
              </Button>
            ) : null}
            {selectedProfileId && onSaveAsTemplate ? (
              <Button variant="secondary" size="sm" onClick={onSaveAsTemplate}>
                {t.profiles.saveAsTemplate}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {selectedProfileId ? (
              <Button variant="danger" size="sm" {...bindPointerAction('delete-profile', onDelete)}>
                {t.profiles.deleteProfile}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" {...bindPointerAction('close-profile-drawer', onClose)}>
              {copy.cancel}
            </Button>
            <Button
              variant={saveState === 'error' ? 'danger' : 'primary'}
              size="sm"
              disabled={saveState === 'saving'}
              {...bindPointerAction('save-profile', handleSaveAction)}
            >
              {saveButtonLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
