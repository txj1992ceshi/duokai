/**
 * humanize.js
 * 
 * Human behavior simulation utilities for the stealth engine.
 * These helpers make automated browser actions look organic:
 *  - Random delays between actions
 *  - Bezier-curve mouse movement
 *  - Natural typing cadence with occasional micro-pauses
 */

'use strict';

/**
 * Sleep for a random duration within [min, max] ms.
 */
function randomDelay(min = 80, max = 300) {
  const ms = min + Math.random() * (max - min);
  return new Promise(res => setTimeout(res, ms));
}

/**
 * Smoothly move the mouse from current position to (x, y)
 * along a randomized Bezier curve, simulating human hand jitter.
 * 
 * @param {import('playwright').Page} page
 * @param {number} x - Target X
 * @param {number} y - Target Y
 * @param {object} opts
 * @param {number} opts.steps   - Number of intermediate points (default 25)
 * @param {number} opts.jitter  - Max pixel random offset per step (default 4)
 */
async function humanMouseMove(page, x, y, { steps = 25, jitter = 4 } = {}) {
  // Get current mouse position (approximated from viewport center on first call)
  const vp = page.viewportSize() || { width: 1280, height: 800 };
  const fromX = vp.width / 2;
  const fromY = vp.height / 2;

  // Random Bezier control points for a curved trajectory
  const cp1x = fromX + (Math.random() - 0.5) * 200;
  const cp1y = fromY + (Math.random() - 0.5) * 200;
  const cp2x = x    + (Math.random() - 0.5) * 200;
  const cp2y = y    + (Math.random() - 0.5) * 200;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    // Cubic Bezier B(t) = u³P₀ + 3u²tP₁ + 3ut²P₂ + t³P₃
    const nx = u*u*u*fromX + 3*u*u*t*cp1x + 3*u*t*t*cp2x + t*t*t*x
             + (Math.random() - 0.5) * jitter;
    const ny = u*u*u*fromY + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*y
             + (Math.random() - 0.5) * jitter;
    await page.mouse.move(nx, ny);
    await randomDelay(5, 18);
  }
}

/**
 * Click at (x, y) with human-like mouse movement and pre/post delays.
 */
async function humanClick(page, x, y) {
  await humanMouseMove(page, x, y);
  await randomDelay(40, 120);
  await page.mouse.down();
  await randomDelay(30, 80);
  await page.mouse.up();
  await randomDelay(50, 150);
}

/**
 * Type a string character by character with variable delay, simulating
 * a real user who occasionally pauses between words.
 * 
 * @param {import('playwright').Page} page
 * @param {string} text
 * @param {object} opts
 * @param {number} opts.minDelay - Min ms per keystroke (default 60)
 * @param {number} opts.maxDelay - Max ms per keystroke (default 180)
 */
async function humanType(page, text, { minDelay = 60, maxDelay = 180 } = {}) {
  for (const char of text) {
    await page.keyboard.type(char);
    // Occasional longer pause at spaces (simulates thinking between words)
    const delay = char === ' '
      ? randomDelay(minDelay * 2, maxDelay * 3)
      : randomDelay(minDelay, maxDelay);
    await delay;
  }
}

/**
 * Perform a natural scroll, divided into multiple small increments.
 *
 * @param {import('playwright').Page} page
 * @param {number} deltaY  - Total pixels to scroll (positive = down)
 * @param {number} steps   - How many scroll increments (default 8)
 */
async function humanScroll(page, deltaY, steps = 8) {
  const increment = deltaY / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, increment + (Math.random() - 0.5) * 10);
    await randomDelay(30, 90);
  }
}

module.exports = { randomDelay, humanMouseMove, humanClick, humanType, humanScroll };
