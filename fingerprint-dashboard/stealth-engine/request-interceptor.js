/**
 * request-interceptor.js
 * 
 * Intercepts outgoing requests to normalize headers and Client-Hints.
 * Ensures headers match the profile's User-Agent, platform, and language.
 */

'use strict';

/**
 * Setup request interception for a Playwright context
 * @param {import('playwright').BrowserContext} context 
 * @param {object} profile 
 */
async function setupRequestInterceptor(context, profile) {
  const { userAgent, languages } = profile;
  
  // Extract major version for Client Hints
  const chromeVersionMatch = userAgent.match(/Chrome\/(\d+)/);
  const majorVersion = chromeVersionMatch ? chromeVersionMatch[1] : '122';
  
  const clientHints = {
    'sec-ch-ua': `"Chromium";v="${majorVersion}", "Not(A:Brand";v="24", "Google Chrome";v="${majorVersion}"`,
    'sec-ch-ua-mobile': profile.isMobile ? '?1' : '?0',
    'sec-ch-ua-platform': `"${getPlatformName(profile.platform)}"`,
    'sec-ch-lang': languages.join(', '),
  };

  await context.setExtraHTTPHeaders({
    'Accept-Language': languages.join(',') + ';q=0.9',
    ...clientHints
  });

  // Optional: Use context.route to dynamically adjust headers for every individual request
  await context.route('**/*', (route) => {
    const request = route.request();
    const headers = request.headers();
    
    // Ensure consistency
    headers['user-agent'] = userAgent;
    
    route.continue({ headers });
  });
}

function getPlatformName(platform) {
  if (platform.toLowerCase().includes('win')) return 'Windows';
  if (platform.toLowerCase().includes('mac')) return 'macOS';
  if (platform.toLowerCase().includes('linux')) return 'Linux';
  if (platform.toLowerCase().includes('android')) return 'Android';
  if (platform.toLowerCase().includes('iphone') || platform.toLowerCase().includes('ios')) return 'iOS';
  return 'Windows';
}

module.exports = { setupRequestInterceptor };
