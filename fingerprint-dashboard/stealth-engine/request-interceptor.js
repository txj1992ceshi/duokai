/**
 * request-interceptor.js
 * 
 * Applies a minimal Accept-Language override.
 * Let Chromium generate its own client hints and request headers naturally.
 */

'use strict';

/**
 * Setup request interception for a Playwright context
 * @param {import('playwright').BrowserContext} context 
 * @param {object} profile 
 */
async function setupRequestInterceptor(context, profile) {
  const { languages } = profile;
  const normalizedLanguages = Array.isArray(languages)
    ? languages.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  if (normalizedLanguages.length) {
    await context.setExtraHTTPHeaders({
      'Accept-Language': normalizedLanguages.join(',') + ';q=0.9',
    });
  }
}

module.exports = { setupRequestInterceptor };
