import type { FingerprintConfig } from '../../src/shared/types'

function hashSeed(value: string): number {
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

export function buildFingerprintInitScript(profileId: string, config: FingerprintConfig): string {
  const seed = hashSeed(`${profileId}:${config.userAgent}:${config.language}:${config.timezone}`)
  const languages = JSON.stringify(
    config.language
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  const geolocation =
    config.advanced.geolocation.trim().length > 0
      ? config.advanced.geolocation
          .split(',')
          .map((item) => Number(item.trim()))
          .filter((item) => !Number.isNaN(item))
      : []
  const permissions =
    config.advanced.geolocationPermission === 'allow'
      ? ['granted']
      : config.advanced.geolocationPermission === 'block'
        ? ['denied']
        : ['prompt']

  return `
(() => {
  const seed = ${seed};
  const canvasMode = ${JSON.stringify(config.advanced.canvasMode)};
  const webglImageMode = ${JSON.stringify(config.advanced.webglImageMode)};
  const webglMetadataMode = ${JSON.stringify(config.advanced.webglMetadataMode)};
  const audioMode = ${JSON.stringify(config.advanced.audioContextMode)};
  const clientRectsMode = ${JSON.stringify(config.advanced.clientRectsMode)};
  const mediaDevicesMode = ${JSON.stringify(config.advanced.mediaDevicesMode)};
  const speechVoicesMode = ${JSON.stringify(config.advanced.speechVoicesMode)};
  const geolocation = ${JSON.stringify(geolocation)};
  const permissionState = ${JSON.stringify(permissions[0])};

  function rngFactory(initialSeed) {
    let state = initialSeed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const canvasRng = rngFactory(seed ^ 0xabc123);
  const audioRng = rngFactory(seed ^ 0xdef456);
  const rectsRng = rngFactory(seed ^ 0x991122);

  const navigatorOverrides = {
    userAgent: ${JSON.stringify(config.userAgent)},
    language: ${JSON.stringify(config.language)},
    languages: ${languages},
    hardwareConcurrency: ${config.advanced.cpuMode === 'custom' ? Math.max(1, config.advanced.cpuCores) : 8},
    deviceMemory: ${Math.max(1, config.advanced.memoryGb)},
    platform: ${JSON.stringify(buildPlatformValue(config))},
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

  if (canvasMode !== 'off') {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        const image = ctx.getImageData(0, 0, this.width, this.height);
        for (let index = 0; index < image.data.length; index += 4) {
          image.data[index] += Math.floor(canvasRng() * 3) - 1;
          image.data[index + 1] += Math.floor(canvasRng() * 3) - 1;
          image.data[index + 2] += Math.floor(canvasRng() * 3) - 1;
        }
        ctx.putImageData(image, 0, 0);
      }
      return originalToDataURL.apply(this, args);
    };
  }

  if (webglMetadataMode !== 'off') {
    const patchGetParameter = (target) => {
      if (!target) return;
      const original = target.getParameter;
      target.getParameter = function(parameter) {
        if (parameter === 37445) return ${JSON.stringify(config.advanced.webglVendor)};
        if (parameter === 37446) return ${JSON.stringify(config.advanced.webglRenderer)};
        return original.apply(this, arguments);
      };
    };
    patchGetParameter(typeof WebGLRenderingContext !== 'undefined' ? WebGLRenderingContext.prototype : null);
    patchGetParameter(typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext.prototype : null);
  }

  if (audioMode !== 'off') {
    const originalGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function() {
      const channel = originalGetChannelData.apply(this, arguments);
      if (channel.length < 5000) {
        for (let index = 0; index < channel.length; index += 1) {
          channel[index] += (audioRng() - 0.5) * 0.00001;
        }
      }
      return channel;
    };
  }

  if (clientRectsMode !== 'off') {
    const originalBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function() {
      const rect = originalBoundingClientRect.apply(this, arguments);
      const offset = clientRectsMode === 'random' ? (rectsRng() - 0.5) * 0.6 : 0.2;
      return {
        ...rect,
        x: rect.x + offset,
        y: rect.y + offset,
        top: rect.top + offset,
        left: rect.left + offset,
        right: rect.right + offset,
        bottom: rect.bottom + offset,
      };
    };
  }

  if (mediaDevicesMode !== 'off' && navigator.mediaDevices?.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices = async () => [
      { deviceId: 'default-mic', kind: 'audioinput', label: '', groupId: 'audio' },
      { deviceId: 'default-speaker', kind: 'audiooutput', label: '', groupId: 'audio' },
      { deviceId: 'default-camera', kind: 'videoinput', label: '', groupId: 'video' },
    ];
  }

  if (speechVoicesMode !== 'off' && 'speechSynthesis' in window) {
    const voices = [
      { name: 'Google US English', lang: 'en-US', default: true, voiceURI: 'Google US English' },
      { name: 'Google UK English Female', lang: 'en-GB', default: false, voiceURI: 'Google UK English Female' },
    ];
    window.speechSynthesis.getVoices = () => voices;
  }

  if (geolocation.length === 2 && navigator.geolocation) {
    const coords = {
      latitude: geolocation[0],
      longitude: geolocation[1],
      accuracy: 20,
    };
    navigator.geolocation.getCurrentPosition = (success, error) => {
      if (permissionState === 'denied') {
        error?.({ code: 1, message: 'Geolocation denied' });
        return;
      }
      success({
        coords,
        timestamp: Date.now(),
      });
    };
    navigator.geolocation.watchPosition = (success) => {
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
        return Promise.resolve({ state: permissionState });
      }
      return originalQuery(parameters);
    };
  }

  window.__BITBROWSER_CLONE_INJECTED__ = {
    canvas: canvasMode !== 'off',
    webgl: webglImageMode !== 'off' || webglMetadataMode !== 'off',
    audio: audioMode !== 'off',
    clientRects: clientRectsMode !== 'off',
    mediaDevices: mediaDevicesMode !== 'off',
    speechVoices: speechVoicesMode !== 'off',
  };
})();
`
}
