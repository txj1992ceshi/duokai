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
import { COMMON_TIMEZONE_OPTIONS } from '../../shared/timezones'
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
        environmentPurpose: '用途标签',
        environmentPurposeHint: '仅用于分类与提醒，不会自动改变当前环境的启动参数、指纹或网络设置。',
        machineIdentity: '机器身份：自动生成（推荐）',
        systemFamilyPolicy: '系统家族：与当前电脑兼容',
        deviceProfilePolicy: '设备画像：每个环境独立生成',
        regionPolicy: '地区信息：跟随代理出口',
        stabilityPolicy: '身份稳定性：创建后固定',
        identityLocked: '当前环境的机器身份已固定。平台选择不会再修改系统、浏览器版本或硬件画像。',
        identityDraft: '创建前可以换一套画像；保存后将固定，不会随启动变化。',
        operatingSystem: '系统家族',
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
        autoResolved: '由代理 IP 自动解析',
        manualMode: '手动模式',
        quickFingerprint: '自动机器身份',
        quickFingerprintDescription: '由设备模板成套生成，并与当前电脑系统家族保持兼容',
        randomize: '换一套草稿画像',
        platform: '平台',
        selectPlatform: '请选择',
        custom: '自定义',
        webrtcDefault: '默认',
        webrtcProxyAware: '代理感知（推荐）',
        webrtcDisabled: '禁用',
        platformName: '平台名称',
        platformUrl: '平台 URL',
        modeStableCustom: '稳定自定义（推荐）',
        modeLegacyRandom: '旧版随机',
        modeOff: '关闭',
        webglImage: 'WebGL 图像',
        audio: '音频',
        clientRects: 'ClientRects',
        mediaDevices: '媒体设备',
        speechVoices: '语音列表',
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
        environmentPurpose: 'Purpose label',
        environmentPurposeHint:
          'Used for classification and reminders only. It does not automatically change launch settings, fingerprints, or network behavior.',
        machineIdentity: 'Machine identity: Auto-generated (Recommended)',
        systemFamilyPolicy: 'System family: Compatible with this computer',
        deviceProfilePolicy: 'Device profile: Independently generated per environment',
        regionPolicy: 'Region: Follows the proxy egress',
        stabilityPolicy: 'Identity stability: Fixed after creation',
        identityLocked: 'This environment identity is fixed. Platform presets no longer change its OS, browser version, or hardware profile.',
        identityDraft: 'You may choose another profile before creation. It becomes fixed after saving.',
        operatingSystem: 'System family',
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
        autoResolved: 'Resolved automatically from the proxy IP',
        manualMode: 'Manual mode',
        quickFingerprint: 'Automatic machine identity',
        quickFingerprintDescription: 'Generated as a coherent device template compatible with this computer',
        randomize: 'Choose another draft',
        platform: 'Platform',
        selectPlatform: 'Select',
        custom: 'Custom',
        webrtcDefault: 'Default',
        webrtcProxyAware: 'Proxy-aware (Recommended)',
        webrtcDisabled: 'Disabled',
        platformName: 'Platform name',
        platformUrl: 'Platform URL',
        modeStableCustom: 'Stable custom (Recommended)',
        modeLegacyRandom: 'Legacy random',
        modeOff: 'Off',
        webglImage: 'WebGL image',
        audio: 'Audio',
        clientRects: 'ClientRects',
        mediaDevices: 'Media devices',
        speechVoices: 'Speech voices',
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
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <div className="text-sm font-semibold text-slate-900">{copy.machineIdentity}</div>
                <div className="mt-3 grid gap-2 text-sm text-slate-700">
                  <div>{copy.systemFamilyPolicy}</div>
                  <div>{copy.deviceProfilePolicy}</div>
                  <div>{copy.regionPolicy}</div>
                  <div>{copy.stabilityPolicy}</div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  {selectedProfileId ? copy.identityLocked : copy.identityDraft}
                </div>
              </div>
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
                <div className="text-xs text-slate-500">{copy.environmentPurposeHint}</div>
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
                  <Input value={profileForm.fingerprintConfig.advanced.operatingSystem} readOnly />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.chromeVersion}</span>
                  <Input value={profileForm.fingerprintConfig.advanced.browserVersion} readOnly />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.windowSize}</span>
                  <Input
                    value={`${profileForm.fingerprintConfig.advanced.windowWidth}x${profileForm.fingerprintConfig.advanced.windowHeight}`}
                    readOnly
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.cpuAndMemory}</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={`${profileForm.fingerprintConfig.advanced.cpuCores} CPU`} readOnly />
                    <Input value={`${profileForm.fingerprintConfig.advanced.memoryGb} GB`} readOnly />
                  </div>
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{copy.webglRenderer}</span>
                <Input value={profileForm.fingerprintConfig.advanced.webglRenderer} readOnly />
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
                      setProfileForm((current) => {
                        const autoTimezoneFromIp = event.target.value === 'auto'
                        return {
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            timezone:
                              autoTimezoneFromIp
                                ? current.fingerprintConfig.timezone
                                : current.fingerprintConfig.timezone || 'America/Los_Angeles',
                            advanced: {
                              ...current.fingerprintConfig.advanced,
                              autoTimezoneFromIp,
                            },
                          },
                        }
                      })
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
                  <Select
                    value={profileForm.fingerprintConfig.timezone}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          timezone: event.target.value,
                        },
                      }))
                    }
                  >
                    {COMMON_TIMEZONE_OPTIONS.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-slate-500">{copy.manualMode}</p>
                </label>
              ) : (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t.profiles.timezone}</span>
                  <Input
                    value={profileForm.fingerprintConfig.timezone}
                    readOnly
                    placeholder="America/Los_Angeles"
                  />
                  <p className="text-xs text-slate-500">{copy.autoResolved}</p>
                </label>
              )}
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{copy.geolocation}</span>
                <Select
                  value={profileForm.fingerprintConfig.advanced.autoGeolocationFromIp ? 'auto' : 'manual'}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      fingerprintConfig: {
                        ...current.fingerprintConfig,
                        advanced: {
                          ...current.fingerprintConfig.advanced,
                          autoGeolocationFromIp: event.target.value === 'auto',
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
                <span className="text-sm font-medium text-slate-700">{copy.geolocation}</span>
                <Input
                  value={profileForm.fingerprintConfig.advanced.geolocation}
                  readOnly={profileForm.fingerprintConfig.advanced.autoGeolocationFromIp}
                  placeholder="34.0522, -118.2437"
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      fingerprintConfig: {
                        ...current.fingerprintConfig,
                        advanced: {
                          ...current.fingerprintConfig.advanced,
                          geolocation: event.target.value,
                        },
                      },
                    }))
                  }
                />
                <p className="text-xs text-slate-500">
                  {profileForm.fingerprintConfig.advanced.autoGeolocationFromIp ? copy.autoResolved : copy.manualMode}
                </p>
              </label>
            </TabsContent>

            <TabsContent value="fingerprint" className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-slate-800">{copy.quickFingerprint}</div>
                  <div className="text-xs text-slate-500">{copy.quickFingerprintDescription}</div>
                </div>
                {!selectedProfileId ? (
                  <Button variant="secondary" size="sm" onClick={onRandomizeFingerprint}>
                    {copy.randomize}
                  </Button>
                ) : null}
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
                    <option value="proxy-aware">{copy.webrtcProxyAware}</option>
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
                <Textarea rows={4} value={profileForm.fingerprintConfig.userAgent} readOnly />
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
                    <option value="custom">{copy.modeStableCustom}</option>
                    <option value="random">{copy.modeLegacyRandom}</option>
                    <option value="off">{copy.modeOff}</option>
                  </Select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.webglImage}</span>
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
                    <option value="custom">{copy.modeStableCustom}</option>
                    <option value="random">{copy.modeLegacyRandom}</option>
                    <option value="off">{copy.modeOff}</option>
                  </Select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.audio}</span>
                  <Select
                    value={profileForm.fingerprintConfig.advanced.audioContextMode}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            audioContextMode: event.target.value as typeof current.fingerprintConfig.advanced.audioContextMode,
                          },
                        },
                      }))
                    }
                  >
                    <option value="custom">{copy.modeStableCustom}</option>
                    <option value="random">{copy.modeLegacyRandom}</option>
                    <option value="off">{copy.modeOff}</option>
                  </Select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.clientRects}</span>
                  <Select
                    value={profileForm.fingerprintConfig.advanced.clientRectsMode}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            clientRectsMode: event.target.value as typeof current.fingerprintConfig.advanced.clientRectsMode,
                          },
                        },
                      }))
                    }
                  >
                    <option value="off">{copy.modeOff}</option>
                    <option value="custom">{copy.modeStableCustom}</option>
                    <option value="random">{copy.modeLegacyRandom}</option>
                  </Select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.mediaDevices}</span>
                  <Select
                    value={profileForm.fingerprintConfig.advanced.mediaDevicesMode}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            mediaDevicesMode: event.target.value as typeof current.fingerprintConfig.advanced.mediaDevicesMode,
                          },
                        },
                      }))
                    }
                  >
                    <option value="custom">{copy.modeStableCustom}</option>
                    <option value="random">{copy.modeLegacyRandom}</option>
                    <option value="off">{copy.modeOff}</option>
                  </Select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.speechVoices}</span>
                  <Select
                    value={profileForm.fingerprintConfig.advanced.speechVoicesMode}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fingerprintConfig: {
                          ...current.fingerprintConfig,
                          advanced: {
                            ...current.fingerprintConfig.advanced,
                            speechVoicesMode: event.target.value as typeof current.fingerprintConfig.advanced.speechVoicesMode,
                          },
                        },
                      }))
                    }
                  >
                    <option value="custom">{copy.modeStableCustom}</option>
                    <option value="random">{copy.modeLegacyRandom}</option>
                    <option value="off">{copy.modeOff}</option>
                  </Select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{copy.deviceName}</span>
                  <Input
                    value={profileForm.fingerprintConfig.advanced.deviceName}
                    readOnly
                />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Host IP</span>
                  <Input
                    value={profileForm.fingerprintConfig.advanced.hostIp}
                    readOnly
                />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">MAC</span>
                  <Input
                    value={profileForm.fingerprintConfig.advanced.macAddress}
                    readOnly
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
