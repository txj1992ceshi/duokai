import type {
  CanvasMode,
  FingerprintConfig,
  SimpleFingerprintMode,
  WebglMode,
} from '../../src/shared/types'
import {
  resolveDeviceInfoBaseline,
  resolveFontBaseline,
} from './desktopRealism'

type ScriptMode = 'off' | 'custom' | 'random'

export interface FingerprintFeatureStrategy {
  mode: ScriptMode
  enabled: boolean
  intensity: 'none' | 'stable' | 'legacy'
  amplitude: number
  sparseStep: number
}

export interface FingerprintClientRectsStrategy {
  mode: ScriptMode
  enabled: boolean
  intensity: 'none' | 'stable' | 'legacy'
  offset: number
}

export interface FingerprintMediaDeviceDescriptor {
  deviceId: string
  kind: 'audioinput' | 'audiooutput' | 'videoinput'
  label: string
  groupId: string
}

export interface FingerprintSpeechVoiceDescriptor {
  name: string
  lang: string
  default: boolean
  voiceURI: string
  localService: boolean
}

export interface FingerprintFontStrategy {
  mode: 'system' | 'random'
  enabled: boolean
  intensity: 'stable' | 'legacy'
  supportedFamilies: string[]
  genericFamilies: string[]
  defaultFontFamily: string
  metricsSalt: string
}

export interface FingerprintDeviceInfoStrategy {
  mode: 'custom' | 'off'
  enabled: boolean
  intensity: 'stable' | 'none'
  appVersion: string
  platform: string
  platformVersion: string
  architecture: string
  bitness: string
  model: string
  mobile: boolean
  wow64: boolean
  maxTouchPoints: number
  pdfViewerEnabled: boolean
  brands: Array<{ brand: string; version: string }>
  fullVersionList: Array<{ brand: string; version: string }>
  uaFullVersion: string
  formFactors: string[]
}

export interface FingerprintScriptStrategy {
  seed: number
  navigatorLanguage: string
  languages: string[]
  hardwareConcurrency: number
  deviceMemory: number
  platform: string
  geolocation: number[]
  permissionState: 'granted' | 'denied' | 'prompt'
  fonts: FingerprintFontStrategy
  canvas: FingerprintFeatureStrategy
  webglImage: FingerprintFeatureStrategy
  webglMetadata: {
    mode: ScriptMode
    enabled: boolean
    intensity: 'none' | 'stable' | 'legacy'
    vendor: string
    renderer: string
  }
  audio: FingerprintFeatureStrategy
  clientRects: FingerprintClientRectsStrategy
  mediaDevices: {
    mode: ScriptMode
    enabled: boolean
    intensity: 'none' | 'stable' | 'legacy'
    devices: FingerprintMediaDeviceDescriptor[]
  }
  speechVoices: {
    mode: ScriptMode
    enabled: boolean
    intensity: 'none' | 'stable' | 'legacy'
    voices: FingerprintSpeechVoiceDescriptor[]
  }
  deviceInfo: FingerprintDeviceInfoStrategy
}

const VOICE_CATALOG: Record<string, Array<{ name: string; lang: string }>> = {
  de: [
    { name: 'Google Deutsch', lang: 'de-DE' },
    { name: 'Google Deutsch (Schweiz)', lang: 'de-CH' },
  ],
  en: [
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Google UK English Female', lang: 'en-GB' },
  ],
  es: [
    { name: 'Google espanol', lang: 'es-ES' },
    { name: 'Google espanol de Estados Unidos', lang: 'es-US' },
  ],
  fr: [
    { name: 'Google francais', lang: 'fr-FR' },
    { name: 'Google francais du Canada', lang: 'fr-CA' },
  ],
  it: [
    { name: 'Google italiano', lang: 'it-IT' },
    { name: 'Google italiano (Svizzera)', lang: 'it-CH' },
  ],
  ja: [
    { name: 'Google Nihongo', lang: 'ja-JP' },
    { name: 'Google English', lang: 'en-US' },
  ],
  ko: [
    { name: 'Google Hangugeo', lang: 'ko-KR' },
    { name: 'Google English', lang: 'en-US' },
  ],
  pt: [
    { name: 'Google portugues do Brasil', lang: 'pt-BR' },
    { name: 'Google portugues', lang: 'pt-PT' },
  ],
  zh: [
    { name: 'Google Putonghua', lang: 'zh-CN' },
    { name: 'Google Guoyu', lang: 'zh-TW' },
  ],
}

export function hashSeed(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash || 1
}

function buildPlatformValue(config: FingerprintConfig): string {
  if (config.advanced.deviceMode === 'android') {
    return 'Linux armv8l'
  }
  if (config.advanced.deviceMode === 'ios') {
    return 'iPhone'
  }
  const operatingSystem = config.advanced.operatingSystem.toLowerCase()
  if (operatingSystem.includes('windows')) {
    return 'Win32'
  }
  if (operatingSystem.includes('mac')) {
    return 'MacIntel'
  }
  return 'Linux x86_64'
}

function normalizeScriptMode(mode: CanvasMode | WebglMode | SimpleFingerprintMode): ScriptMode {
  if (mode === 'off') {
    return 'off'
  }
  if (mode === 'custom') {
    return 'custom'
  }
  return 'random'
}

function resolveFeatureStrategy(
  mode: CanvasMode | WebglMode | SimpleFingerprintMode,
  options: {
    customAmplitude: number
    randomAmplitude: number
    customSparseStep: number
    randomSparseStep: number
  },
): FingerprintFeatureStrategy {
  const normalizedMode = normalizeScriptMode(mode)
  if (normalizedMode === 'off') {
    return {
      mode: normalizedMode,
      enabled: false,
      intensity: 'none',
      amplitude: 0,
      sparseStep: 0,
    }
  }
  if (normalizedMode === 'custom') {
    return {
      mode: normalizedMode,
      enabled: true,
      intensity: 'stable',
      amplitude: options.customAmplitude,
      sparseStep: options.customSparseStep,
    }
  }
  return {
    mode: normalizedMode,
    enabled: true,
    intensity: 'legacy',
    amplitude: options.randomAmplitude,
    sparseStep: options.randomSparseStep,
  }
}

function buildStableToken(seed: number, label: string): string {
  return hashSeed(`${seed}:${label}`).toString(16).padStart(8, '0')
}

function buildLanguageCandidates(config: FingerprintConfig): string[] {
  const rawCandidates = [
    config.advanced.interfaceLanguage,
    config.language,
    'en-US',
  ]

  const seen = new Set<string>()
  const candidates: string[] = []
  for (const rawValue of rawCandidates) {
    for (const item of String(rawValue || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)) {
      if (!seen.has(item)) {
        seen.add(item)
        candidates.push(item)
      }
    }
  }

  return candidates.length > 0 ? candidates : ['en-US']
}

function buildMediaDevices(seed: number, config: FingerprintConfig): FingerprintMediaDeviceDescriptor[] {
  const normalizedName = config.advanced.deviceName.trim().toUpperCase()
  const includeCamera = !normalizedName.startsWith('DESKTOP-')
  const descriptors: FingerprintMediaDeviceDescriptor[] = [
    {
      deviceId: buildStableToken(seed, 'audioinput'),
      kind: 'audioinput',
      label: '',
      groupId: buildStableToken(seed, 'audio'),
    },
    {
      deviceId: buildStableToken(seed, 'audiooutput'),
      kind: 'audiooutput',
      label: '',
      groupId: buildStableToken(seed, 'audio'),
    },
  ]

  if (includeCamera) {
    descriptors.push({
      deviceId: buildStableToken(seed, 'videoinput'),
      kind: 'videoinput',
      label: '',
      groupId: buildStableToken(seed, 'video'),
    })
  }

  return descriptors
}

function buildSpeechVoices(config: FingerprintConfig): FingerprintSpeechVoiceDescriptor[] {
  const languageCandidates = buildLanguageCandidates(config)
  const primaryLanguage = languageCandidates[0]
  const primaryRoot = primaryLanguage.split('-')[0]?.toLowerCase() || 'en'
  const fallbackCatalog = VOICE_CATALOG[primaryRoot] ?? [{ name: `Google ${primaryLanguage}`, lang: primaryLanguage }]
  const englishFallback = VOICE_CATALOG.en

  const seen = new Set<string>()
  const voices: FingerprintSpeechVoiceDescriptor[] = []

  for (const candidate of [...fallbackCatalog, ...englishFallback]) {
    if (seen.has(candidate.lang)) {
      continue
    }
    seen.add(candidate.lang)
    voices.push({
      ...candidate,
      default: voices.length === 0,
      voiceURI: candidate.name,
      localService: true,
    })
  }

  return voices
}

export function resolveFingerprintScriptStrategy(
  profileId: string,
  config: FingerprintConfig,
): FingerprintScriptStrategy {
  const seed = hashSeed(`${profileId}:${config.userAgent}:${config.language}:${config.timezone}`)
  const geolocation =
    config.advanced.geolocation.trim().length > 0
      ? config.advanced.geolocation
          .split(',')
          .map((item) => Number(item.trim()))
          .filter((item) => !Number.isNaN(item))
      : []
  const permissionState =
    config.advanced.geolocationPermission === 'allow'
      ? 'granted'
      : config.advanced.geolocationPermission === 'block'
        ? 'denied'
        : 'prompt'
  const languages = buildLanguageCandidates(config)
  const mediaDevicesMode = normalizeScriptMode(config.advanced.mediaDevicesMode)
  const speechVoicesMode = normalizeScriptMode(config.advanced.speechVoicesMode)
  const fontBaseline = resolveFontBaseline(config)
  const deviceInfoBaseline = resolveDeviceInfoBaseline(config)

  return {
    seed,
    navigatorLanguage: languages[0],
    languages,
    hardwareConcurrency: config.advanced.cpuMode === 'custom' ? Math.max(1, config.advanced.cpuCores) : 8,
    deviceMemory: Math.max(1, config.advanced.memoryGb),
    platform: buildPlatformValue(config),
    geolocation,
    permissionState,
    fonts: {
      mode: config.advanced.fontMode,
      enabled: true,
      intensity: config.advanced.fontMode === 'random' ? 'legacy' : 'stable',
      supportedFamilies: fontBaseline.supportedFamilies,
      genericFamilies: fontBaseline.genericFamilies,
      defaultFontFamily: fontBaseline.defaultFontFamily,
      metricsSalt: fontBaseline.metricsSalt,
    },
    canvas: resolveFeatureStrategy(config.advanced.canvasMode, {
      customAmplitude: 1,
      randomAmplitude: 3,
      customSparseStep: 211,
      randomSparseStep: 67,
    }),
    webglImage: resolveFeatureStrategy(config.advanced.webglImageMode, {
      customAmplitude: 1,
      randomAmplitude: 3,
      customSparseStep: 257,
      randomSparseStep: 79,
    }),
    webglMetadata: {
      mode: normalizeScriptMode(config.advanced.webglMetadataMode),
      enabled: config.advanced.webglMetadataMode !== 'off',
      intensity: config.advanced.webglMetadataMode === 'random' ? 'legacy' : 'stable',
      vendor: config.advanced.webglVendor,
      renderer: config.advanced.webglRenderer,
    },
    audio: resolveFeatureStrategy(config.advanced.audioContextMode, {
      customAmplitude: 5e-7,
      randomAmplitude: 5e-6,
      customSparseStep: 127,
      randomSparseStep: 31,
    }),
    clientRects:
      config.advanced.clientRectsMode === 'off'
        ? {
            mode: 'off',
            enabled: false,
            intensity: 'none',
            offset: 0,
          }
        : config.advanced.clientRectsMode === 'custom'
          ? {
              mode: 'custom',
              enabled: true,
              intensity: 'stable',
              offset: 0.08,
            }
          : {
              mode: 'random',
              enabled: true,
              intensity: 'legacy',
              offset: 0.24,
            },
    mediaDevices: {
      mode: mediaDevicesMode,
      enabled: mediaDevicesMode !== 'off',
      intensity: mediaDevicesMode === 'random' ? 'legacy' : mediaDevicesMode === 'custom' ? 'stable' : 'none',
      devices: mediaDevicesMode === 'off' ? [] : buildMediaDevices(seed, config),
    },
    speechVoices: {
      mode: speechVoicesMode,
      enabled: speechVoicesMode !== 'off',
      intensity: speechVoicesMode === 'random' ? 'legacy' : speechVoicesMode === 'custom' ? 'stable' : 'none',
      voices: speechVoicesMode === 'off' ? [] : buildSpeechVoices(config),
    },
    deviceInfo: {
      mode: config.advanced.deviceInfoMode === 'custom' ? 'custom' : 'off',
      enabled: config.advanced.deviceInfoMode === 'custom',
      intensity: config.advanced.deviceInfoMode === 'custom' ? 'stable' : 'none',
      appVersion: config.userAgent.replace(/^Mozilla\//, ''),
      platform: deviceInfoBaseline.platform,
      platformVersion: deviceInfoBaseline.platformVersion,
      architecture: deviceInfoBaseline.architecture,
      bitness: deviceInfoBaseline.bitness,
      model: deviceInfoBaseline.model,
      mobile: deviceInfoBaseline.mobile,
      wow64: deviceInfoBaseline.wow64,
      maxTouchPoints: deviceInfoBaseline.maxTouchPoints,
      pdfViewerEnabled: deviceInfoBaseline.pdfViewerEnabled,
      brands: deviceInfoBaseline.brands,
      fullVersionList: deviceInfoBaseline.fullVersionList,
      uaFullVersion: deviceInfoBaseline.uaFullVersion,
      formFactors: deviceInfoBaseline.formFactors,
    },
  }
}

export function buildFingerprintInitScript(profileId: string, config: FingerprintConfig): string {
  const strategy = resolveFingerprintScriptStrategy(profileId, config)

  return `
(() => {
  const strategy = ${JSON.stringify(strategy)};
  const seed = strategy.seed;

  function rngFactory(initialSeed) {
    let state = initialSeed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function buildLocalSeed(...parts) {
    let value = seed >>> 0;
    for (const part of parts) {
      value = (value * 31 + Number(part || 0)) >>> 0;
    }
    return value || 1;
  }

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function hashText(value) {
    let hash = 0;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return hash || 1;
  }

  function applySparseByteNoise(bytes, options, localSeed) {
    if (!bytes || !options?.enabled) {
      return bytes;
    }
    const rng = rngFactory(localSeed);
    const step = Math.max(1, options.sparseStep || 1);
    const amplitude = Math.max(1, options.amplitude || 1);
    for (let index = 0; index < bytes.length; index += step * 4) {
      bytes[index] = clampByte(bytes[index] + Math.round((rng() - 0.5) * amplitude * 2));
      if (index + 1 < bytes.length) {
        bytes[index + 1] = clampByte(bytes[index + 1] + Math.round((rng() - 0.5) * amplitude * 2));
      }
      if (index + 2 < bytes.length) {
        bytes[index + 2] = clampByte(bytes[index + 2] + Math.round((rng() - 0.5) * amplitude * 2));
      }
    }
    return bytes;
  }

  function createImageDataLike(source, width, height) {
    if (typeof ImageData !== 'undefined') {
      return new ImageData(source, width, height);
    }
    return {
      data: source,
      width,
      height,
    };
  }

  function adjustCanvasImageData(imageData, localSeed) {
    if (!imageData?.data || !strategy.canvas.enabled) {
      return imageData;
    }
    const copiedData = new Uint8ClampedArray(imageData.data);
    applySparseByteNoise(copiedData, strategy.canvas, localSeed);
    return createImageDataLike(copiedData, imageData.width, imageData.height);
  }

  function buildRectOffset(rect, mode, maxOffset) {
    if (mode === 'off') {
      return 0;
    }
    if (mode === 'custom') {
      return maxOffset;
    }
    const rng = rngFactory(buildLocalSeed(rect?.width || 0, rect?.height || 0, rect?.x || 0, rect?.y || 0, 0x991122));
    return (rng() - 0.5) * maxOffset * 2;
  }

  function adjustRect(rect, offset) {
    return {
      x: rect.x + offset,
      y: rect.y + offset,
      top: rect.top + offset,
      left: rect.left + offset,
      right: rect.right + offset,
      bottom: rect.bottom + offset,
      width: rect.width,
      height: rect.height,
      toJSON: () => ({
        x: rect.x + offset,
        y: rect.y + offset,
        top: rect.top + offset,
        left: rect.left + offset,
        right: rect.right + offset,
        bottom: rect.bottom + offset,
        width: rect.width,
        height: rect.height,
      }),
    };
  }

  function createRectList(rects, offset) {
    const adjustedRects = Array.from(rects, (rect) => adjustRect(rect, offset));
    const rectList = {
      length: adjustedRects.length,
      item: (index) => adjustedRects[index] ?? null,
      [Symbol.iterator]: function* () {
        for (const rect of adjustedRects) {
          yield rect;
        }
      },
    };
    adjustedRects.forEach((rect, index) => {
      rectList[index] = rect;
    });
    return rectList;
  }

  function normalizeFontFamilyName(value) {
    return String(value || '').trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  }

  function extractFontFamilies(fontValue) {
    const normalized = String(fontValue || '').trim();
    if (!normalized) {
      return [];
    }
    const familySection = normalized.replace(
      /^.*?(?:\\d+(?:\\.\\d+)?(?:px|pt|em|rem|%)\\s*(?:\\/[^\\s]+)?\\s*)/,
      ''
    );
    return familySection
      .split(',')
      .map((item) => normalizeFontFamilyName(item))
      .filter(Boolean);
  }

  function isSupportedFontFamily(value) {
    const family = normalizeFontFamilyName(value);
    if (!family) {
      return true;
    }
    return (
      strategy.fonts.supportedFamilies.some((item) => normalizeFontFamilyName(item) === family) ||
      strategy.fonts.genericFamilies.some((item) => normalizeFontFamilyName(item) === family)
    );
  }

  function resolveFontFamilyForMetrics(fontValue) {
    const families = extractFontFamilies(fontValue);
    const supportedFamily = families.find((item) => isSupportedFontFamily(item));
    return supportedFamily || normalizeFontFamilyName(strategy.fonts.defaultFontFamily);
  }

  function buildFontMetricFactor(fontValue) {
    const family = resolveFontFamilyForMetrics(fontValue);
    const raw = (hashText(family + ':' + strategy.fonts.metricsSalt) % 17) - 8;
    return 1 + raw / 2500;
  }

  const navigatorOverrides = {
    userAgent: ${JSON.stringify(config.userAgent)},
    language: strategy.navigatorLanguage,
    languages: strategy.languages,
    hardwareConcurrency: strategy.hardwareConcurrency,
    deviceMemory: strategy.deviceMemory,
    platform: strategy.platform,
    vendor: 'Google Inc.',
    webdriver: false,
    doNotTrack: ${JSON.stringify(config.advanced.doNotTrackEnabled ? '1' : '0')},
  };

  for (const [key, value] of Object.entries(navigatorOverrides)) {
    try {
      Object.defineProperty(navigator, key, {
        get: () => value,
        configurable: true,
      });
    } catch {}
  }

  if (strategy.deviceInfo.enabled) {
    const userAgentData = {
      brands: strategy.deviceInfo.brands.map((item) => ({ ...item })),
      mobile: strategy.deviceInfo.mobile,
      platform: strategy.deviceInfo.platform,
      getHighEntropyValues: async (hints) => {
        const payload = {
          architecture: strategy.deviceInfo.architecture,
          bitness: strategy.deviceInfo.bitness,
          brands: strategy.deviceInfo.brands.map((item) => ({ ...item })),
          fullVersionList: strategy.deviceInfo.fullVersionList.map((item) => ({ ...item })),
          mobile: strategy.deviceInfo.mobile,
          model: strategy.deviceInfo.model,
          platform: strategy.deviceInfo.platform,
          platformVersion: strategy.deviceInfo.platformVersion,
          uaFullVersion: strategy.deviceInfo.uaFullVersion,
          wow64: strategy.deviceInfo.wow64,
          formFactors: strategy.deviceInfo.formFactors.slice(),
        };
        if (!Array.isArray(hints)) {
          return payload;
        }
        const result = {};
        for (const hint of hints) {
          if (typeof hint === 'string' && hint in payload) {
            result[hint] = payload[hint];
          }
        }
        return result;
      },
      toJSON() {
        return {
          brands: this.brands.map((item) => ({ ...item })),
          mobile: this.mobile,
          platform: this.platform,
        };
      },
    };

    try {
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => userAgentData,
        configurable: true,
      });
    } catch {}

    for (const [key, value] of Object.entries({
      appVersion: strategy.deviceInfo.appVersion,
      appCodeName: 'Mozilla',
      appName: 'Netscape',
      productSub: '20030107',
      vendorSub: '',
      maxTouchPoints: strategy.deviceInfo.maxTouchPoints,
      pdfViewerEnabled: strategy.deviceInfo.pdfViewerEnabled,
    })) {
      try {
        Object.defineProperty(navigator, key, {
          get: () => value,
          configurable: true,
        });
      } catch {}
    }

    const existingChrome = typeof window.chrome === 'object' && window.chrome ? window.chrome : {};
    try {
      Object.defineProperty(window, 'chrome', {
        get: () => ({
          ...existingChrome,
          app: existingChrome.app || { isInstalled: false },
          runtime: existingChrome.runtime || {},
          csi: existingChrome.csi || (() => ({})),
          loadTimes: existingChrome.loadTimes || (() => ({})),
        }),
        configurable: true,
      });
    } catch {}
  }

  const screenOverrides = {
    width: ${config.advanced.windowWidth},
    height: ${config.advanced.windowHeight},
    availWidth: Math.max(
      ${config.advanced.windowWidth} - Math.max(0, (window.outerWidth || 0) - (window.innerWidth || 0)),
      100
    ),
    availHeight: Math.max(
      ${config.advanced.windowHeight} - Math.max(0, (window.outerHeight || 0) - (window.innerHeight || 0)),
      100
    ),
    colorDepth: 24,
    pixelDepth: 24,
  };

  for (const [key, value] of Object.entries(screenOverrides)) {
    try {
      Object.defineProperty(screen, key, {
        get: () => value,
        configurable: true,
      });
    } catch {}
  }

  if (strategy.fonts.enabled) {
    const patchFontCheck = (target) => {
      const originalCheck = target?.check;
      if (!originalCheck) {
        return;
      }
      target.check = function(font, text) {
        if (!font) {
          return originalCheck.apply(this, arguments);
        }
        return extractFontFamilies(String(font)).some((item) => isSupportedFontFamily(item));
      };
    };

    patchFontCheck(typeof FontFaceSet !== 'undefined' ? FontFaceSet.prototype : null);
    patchFontCheck(document.fonts ? Object.getPrototypeOf(document.fonts) : null);

    const originalMeasureText = CanvasRenderingContext2D?.prototype?.measureText;
    if (originalMeasureText) {
      CanvasRenderingContext2D.prototype.measureText = function(...args) {
        const metrics = originalMeasureText.apply(this, args);
        const factor = buildFontMetricFactor(this.font || '');
        if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.0001) {
          return metrics;
        }
        return new Proxy(metrics, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof value !== 'number') {
              return value;
            }
            if (
              property === 'width' ||
              property === 'actualBoundingBoxLeft' ||
              property === 'actualBoundingBoxRight' ||
              property === 'fontBoundingBoxAscent' ||
              property === 'fontBoundingBoxDescent'
            ) {
              return value * factor;
            }
            return value;
          },
        });
      };
    }
  }

  if (strategy.canvas.enabled) {
    const contextPrototype = typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D.prototype : null;
    const originalGetImageData = contextPrototype?.getImageData;
    if (contextPrototype && originalGetImageData) {
      contextPrototype.getImageData = function(...args) {
        const imageData = originalGetImageData.apply(this, args);
        return adjustCanvasImageData(
          imageData,
          buildLocalSeed(this.canvas?.width || 0, this.canvas?.height || 0, ...(args.map((item) => Number(item || 0))))
        );
      };
    }

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      if (!this.width || !this.height || !originalGetImageData) {
        return originalToDataURL.apply(this, args);
      }
      const scratchCanvas = document.createElement('canvas');
      scratchCanvas.width = this.width;
      scratchCanvas.height = this.height;
      const scratchContext = scratchCanvas.getContext('2d');
      if (!scratchContext) {
        return originalToDataURL.apply(this, args);
      }
      scratchContext.drawImage(this, 0, 0);
      const imageData = originalGetImageData.apply(scratchContext, [0, 0, scratchCanvas.width, scratchCanvas.height]);
      const adjustedImageData = adjustCanvasImageData(
        imageData,
        buildLocalSeed(this.width, this.height, 0x11)
      );
      scratchContext.putImageData(adjustedImageData, 0, 0);
      return originalToDataURL.apply(scratchCanvas, args);
    };

    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    if (originalToBlob) {
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        if (!this.width || !this.height || !originalGetImageData) {
          return originalToBlob.call(this, callback, type, quality);
        }
        const scratchCanvas = document.createElement('canvas');
        scratchCanvas.width = this.width;
        scratchCanvas.height = this.height;
        const scratchContext = scratchCanvas.getContext('2d');
        if (!scratchContext) {
          return originalToBlob.call(this, callback, type, quality);
        }
        scratchContext.drawImage(this, 0, 0);
        const imageData = originalGetImageData.apply(scratchContext, [0, 0, scratchCanvas.width, scratchCanvas.height]);
        const adjustedImageData = adjustCanvasImageData(
          imageData,
          buildLocalSeed(this.width, this.height, 0x29)
        );
        scratchContext.putImageData(adjustedImageData, 0, 0);
        return originalToBlob.call(scratchCanvas, callback, type, quality);
      };
    }
  }

  if (strategy.webglMetadata.enabled || strategy.webglImage.enabled) {
    const patchPrototype = (target) => {
      if (!target) {
        return;
      }

      if (strategy.webglMetadata.enabled) {
        const originalGetParameter = target.getParameter;
        target.getParameter = function(parameter) {
          if (parameter === 37445) return strategy.webglMetadata.vendor;
          if (parameter === 37446) return strategy.webglMetadata.renderer;
          return originalGetParameter.apply(this, arguments);
        };
      }

      if (strategy.webglImage.enabled) {
        const originalReadPixels = target.readPixels;
        if (originalReadPixels) {
          target.readPixels = function(...args) {
            const result = originalReadPixels.apply(this, args);
            const pixels =
              ArrayBuffer.isView(args[6]) ? args[6] :
              ArrayBuffer.isView(args[7]) ? args[7] :
              null;
            if (pixels) {
              const view = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
              applySparseByteNoise(
                view,
                strategy.webglImage,
                buildLocalSeed(args[0] || 0, args[1] || 0, args[2] || 0, args[3] || 0, view.byteLength, 0x55)
              );
            }
            return result;
          };
        }
      }
    };

    patchPrototype(typeof WebGLRenderingContext !== 'undefined' ? WebGLRenderingContext.prototype : null);
    patchPrototype(typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext.prototype : null);
  }

  if (strategy.audio.enabled && typeof AudioBuffer !== 'undefined') {
    const originalGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function() {
      const channel = originalGetChannelData.apply(this, arguments);
      if (!channel?.length) {
        return channel;
      }
      const rng = rngFactory(buildLocalSeed(channel.length, this.sampleRate || 0, 0x77));
      const step = Math.max(1, strategy.audio.sparseStep || 1);
      for (let index = 0; index < channel.length; index += step) {
        channel[index] += (rng() - 0.5) * strategy.audio.amplitude * 2;
      }
      return channel;
    };
  }

  if (strategy.clientRects.enabled) {
    const originalBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function() {
      const rect = originalBoundingClientRect.apply(this, arguments);
      const offset = buildRectOffset(rect, strategy.clientRects.mode, strategy.clientRects.offset);
      return adjustRect(rect, offset);
    };

    const patchClientRects = (target) => {
      const originalGetClientRects = target?.getClientRects;
      if (!originalGetClientRects) {
        return;
      }
      target.getClientRects = function() {
        const rects = originalGetClientRects.apply(this, arguments);
        const referenceRect = rects?.length ? rects[0] : { width: 0, height: 0, x: 0, y: 0 };
        const offset = buildRectOffset(referenceRect, strategy.clientRects.mode, strategy.clientRects.offset);
        return createRectList(rects, offset);
      };
    };

    patchClientRects(typeof Element !== 'undefined' ? Element.prototype : null);
    patchClientRects(typeof Range !== 'undefined' ? Range.prototype : null);
  }

  if (strategy.mediaDevices.enabled && navigator.mediaDevices?.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices = async () =>
      strategy.mediaDevices.devices.map((device) => ({ ...device }));
  }

  if (strategy.speechVoices.enabled && 'speechSynthesis' in window) {
    window.speechSynthesis.getVoices = () =>
      strategy.speechVoices.voices.map((voice) => ({ ...voice }));
  }

  if (strategy.geolocation.length === 2 && navigator.geolocation) {
    const coords = {
      latitude: strategy.geolocation[0],
      longitude: strategy.geolocation[1],
      accuracy: 20,
    };
    navigator.geolocation.getCurrentPosition = (success, error) => {
      if (strategy.permissionState === 'denied') {
        error?.({ code: 1, message: 'Geolocation denied' });
        return;
      }
      success({
        coords,
        timestamp: Date.now(),
      });
    };
    navigator.geolocation.watchPosition = (success, error) => {
      if (strategy.permissionState === 'denied') {
        error?.({ code: 1, message: 'Geolocation denied' });
        return 1;
      }
      success({
        coords,
        timestamp: Date.now(),
      });
      return 1;
    };
  }

  if (navigator.permissions?.query) {
    const originalQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (parameters) => {
      if (parameters?.name === 'geolocation') {
        return Promise.resolve({ state: strategy.permissionState });
      }
      return originalQuery(parameters);
    };
  }

  window.__BITBROWSER_CLONE_INJECTED__ = {
    fonts: strategy.fonts.mode,
    canvas: strategy.canvas.mode,
    webglImage: strategy.webglImage.mode,
    webglMetadata: strategy.webglMetadata.mode,
    audio: strategy.audio.mode,
    clientRects: strategy.clientRects.mode,
    mediaDevices: strategy.mediaDevices.mode,
    speechVoices: strategy.speechVoices.mode,
    deviceInfo: strategy.deviceInfo.mode,
  };
})();
`
}
