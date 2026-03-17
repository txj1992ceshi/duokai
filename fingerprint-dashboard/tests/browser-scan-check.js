/**
 * browser-scan-check.js
 * 
 * Automation script to run a stealth check on popular browser scanning sites.
 */

const { chromium } = require('playwright');
const path = require('path');

async function runCheck(profileId = 'test-profile') {
  console.log(`[Test] Starting stealth check for ${profileId}...`);
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  
  try {
    console.log('[Test] Navigating to BrowserScan...');
    await page.goto('https://www.browserscan.net/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(__dirname, `scan-${profileId}.png`) });
    
    // AmIUnique check
    console.log('[Test] Navigating to AmIUnique...');
    await page.goto('https://amiunique.org/fingerprint', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    console.log('[Test] Scanning complete. Screenshots saved.');
  } catch (e) {
    console.error('[Test] Scan failed', e);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  runCheck();
}
