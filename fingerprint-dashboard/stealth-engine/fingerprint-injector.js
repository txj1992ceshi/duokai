/**
 * fingerprint-injector.js
 * 
 * Core stealth injection script for the fingerprint browser engine.
 * This script runs in the browser context BEFORE any page script loads.
 * It overrides dozens of browser APIs to mask the real hardware fingerprint
 * and make the browser appear as a genuine, unique human user.
 * 
 * @param {object} profile - The profile fingerprint configuration
 */

function buildInjectionScript(profile) {
  const {
    userAgent,
    platform,
    vendor,
    hardwareConcurrency,
    deviceMemory,
    screenWidth,
    screenHeight,
    colorDepth,
    timezone,
    webglVendor,
    webglRenderer,
    canvasSeed,
    audioSeed,
    languages,
  } = profile;

  return `
(function() {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITY: Seeded pseudo-random number generator (Mulberry32)
  // Ensures same profile always produces same fingerprint for consistency
  // ─────────────────────────────────────────────────────────────────────────
  function seededRandom(seed) {
    let s = seed >>> 0;
    return function() {
      s += 0x6D2B79F5;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const canvasRng = seededRandom(${canvasSeed});
  const audioRng  = seededRandom(${audioSeed});

  // ─────────────────────────────────────────────────────────────────────────
  // 1. NAVIGATOR — Mask userAgent, platform, hardware info
  // ─────────────────────────────────────────────────────────────────────────
  const navigatorOverrides = {
    userAgent:            '${userAgent}',
    platform:             '${platform}',
    vendor:               '${vendor}',
    hardwareConcurrency:  ${hardwareConcurrency},
    deviceMemory:         ${deviceMemory},
    languages:            ${JSON.stringify(languages)},
    language:             '${languages[0]}',
    language:             '${languages[0]}',
    webdriver:            false,
    maxTouchPoints:       isMobile ? 5 : 0,
    doNotTrack:           '1',
    deviceMemory:         ${deviceMemory},
  };

  // Add navigator.connection
  const connection = {
    downlink: 10,
    effectiveType: '4g',
    onchange: null,
    rtt: 50,
    saveData: false
  };

  Object.defineProperty(navigator, 'connection', {
    get: () => connection,
    configurable: true
  });

  // Add navigator.getBattery
  if (navigator.getBattery) {
    const battery = {
      charging: true,
      chargingTime: 0,
      dischargingTime: Infinity,
      level: 1,
      onchargingchange: null,
      onchargingtimechange: null,
      ondischargingtimechange: null,
      onlevelchange: null,
    };
    navigator.getBattery = () => Promise.resolve(battery);
  }

  for (const [key, value] of Object.entries(navigatorOverrides)) {
    try {
      Object.defineProperty(navigator, key, {
        get: () => value,
        configurable: true,
        enumerable: true,
      });
    } catch(e) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. SCREEN — Spoof screen dimensions
  // ─────────────────────────────────────────────────────────────────────────
  const screenOverrides = {
    width:       ${screenWidth},
    height:      ${screenHeight},
    availWidth:  ${screenWidth},
    availHeight: ${screenHeight} - 40,
    colorDepth:  ${colorDepth},
    pixelDepth:  ${colorDepth},
  };
  for (const [key, value] of Object.entries(screenOverrides)) {
    try {
      Object.defineProperty(screen, key, { get: () => value, configurable: true });
    } catch(e) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. CANVAS — Add imperceptible pixel noise to mask hardware fingerprint
  // ─────────────────────────────────────────────────────────────────────────
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type, ...args) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, this.width, this.height);
      for (let i = 0; i < imgData.data.length; i += 4) {
        // Add ±1 noise to R/G/B channels — invisible to human eye
        imgData.data[i]     = Math.min(255, Math.max(0, imgData.data[i]     + Math.floor(canvasRng() * 3) - 1));
        imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + Math.floor(canvasRng() * 3) - 1));
        imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + Math.floor(canvasRng() * 3) - 1));
      }
      ctx.putImageData(imgData, 0, 0);
    }
    return originalToDataURL.apply(this, [type, ...args]);
  };

  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
    const imgData = originalGetImageData.apply(this, arguments);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i]     = Math.min(255, Math.max(0, imgData.data[i]     + Math.floor(canvasRng() * 3) - 1));
      imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + Math.floor(canvasRng() * 3) - 1));
      imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + Math.floor(canvasRng() * 3) - 1));
    }
    return imgData;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 4. WEBGL — Spoof GPU vendor and renderer
  // ─────────────────────────────────────────────────────────────────────────
  const getParameterOrig = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return '${webglVendor}';   // UNMASKED_VENDOR_WEBGL
    if (parameter === 37446) return '${webglRenderer}'; // UNMASKED_RENDERER_WEBGL
    return getParameterOrig.apply(this, arguments);
  };

  // Same for WebGL2
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const getParameter2Orig = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return '${webglVendor}';
      if (parameter === 37446) return '${webglRenderer}';
      return getParameter2Orig.apply(this, arguments);
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. AUDIO CONTEXT — Add noise to AudioContext fingerprinting
  // ─────────────────────────────────────────────────────────────────────────
  const AudioBufferGetChannelData = AudioBuffer.prototype.getChannelData;
  AudioBuffer.prototype.getChannelData = function() {
    const array = AudioBufferGetChannelData.apply(this, arguments);
    // Only perturb small buffers used for fingerprinting probes
    if (array.length < 500) {
      for (let i = 0; i < array.length; i++) {
        array[i] += (audioRng() - 0.5) * 0.00001;
      }
    }
    return array;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 6. WEBRTC — Block real IP leakage via STUN
  // ─────────────────────────────────────────────────────────────────────────
  const RTCPeerConnectionOrig = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (RTCPeerConnectionOrig) {
    window.RTCPeerConnection = function(config, ...args) {
      // Strip STUN servers to prevent local IP discovery
      if (config && config.iceServers) {
        config.iceServers = config.iceServers.filter(s =>
          !String(s.urls).includes('stun')
        );
      }
      return new RTCPeerConnectionOrig(config, ...args);
    };
    window.RTCPeerConnection.prototype = RTCPeerConnectionOrig.prototype;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. TIMEZONE — Override Intl API to spoof timezone
  // ─────────────────────────────────────────────────────────────────────────
  const origDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function(locale, options = {}) {
    if (!options.timeZone) {
      options.timeZone = '${timezone}';
    }
    return new origDateTimeFormat(locale, options);
  };
  Intl.DateTimeFormat.prototype = origDateTimeFormat.prototype;

  // ─────────────────────────────────────────────────────────────────────────
  // 8. PLUGINS & MIME TYPES — Simulate a realistic browser plugin list
  // ─────────────────────────────────────────────────────────────────────────
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
      return Object.assign(plugins, { item: (i) => plugins[i], namedItem: (n) => plugins.find(p => p.name === n), refresh: () => {} });
    },
    configurable: true,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 9. PERMISSIONS — Avoid permission API detection of automation
  // ─────────────────────────────────────────────────────────────────────────
  const origQuery = window.navigator.permissions?.query.bind(window.navigator.permissions);
  if (origQuery) {
    window.navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
      }
      return origQuery(parameters);
    };
  }

  // 10. PROTECT PROTOTYPES — Hide the fact that we modified things
  const hideToString = (fn, originalFn) => {
    try {
      fn.toString = () => originalFn.toString();
    } catch(e) {}
  };
  
  hideToString(HTMLCanvasElement.prototype.toDataURL, originalToDataURL);
  hideToString(CanvasRenderingContext2D.prototype.getImageData, originalGetImageData);
  hideToString(WebGLRenderingContext.prototype.getParameter, getParameterOrig);
  if (typeof WebGL2RenderingContext !== 'undefined') {
    hideToString(WebGL2RenderingContext.prototype.getParameter, getParameter2Orig);
  }

  console.debug('[Stealth] Fingerprint injection complete.');
})();
`;
}

module.exports = { buildInjectionScript };
