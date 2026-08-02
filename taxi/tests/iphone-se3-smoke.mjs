import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.TAXI_BASE_URL || 'http://127.0.0.1:4173/taxi/';
const browserName = process.env.TAXI_BROWSER || 'chromium';
const engine = { chromium, webkit }[browserName];
if (!engine) throw new Error(`Unsupported browser: ${browserName}`);

await mkdir('test-results/taxi', { recursive: true });
const browser = await engine.launch();
const context = await browser.newContext({
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo'
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const THEME_KEY = 'yos-taxi-ui-theme-v1';
const pages = [
  ['drive', ''],
  ['today', 'calendar.html?page=today'],
  ['week', 'calendar.html?page=week'],
  ['month', 'calendar.html?page=month'],
  ['manage', 'calendar.html?page=manage']
];
const themes = ['minimal', 'night-gold', 'light', 'map', 'hud'];

async function inspectPage(name, relative, expectedTheme) {
  const url = new URL(relative || './', baseURL).href;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const viewportHeight = window.innerHeight;
    const fixedBottom = [...document.querySelectorAll('*')]
      .filter((node) => getComputedStyle(node).position === 'fixed')
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.bottom >= viewportHeight - 2 && rect.height > 24;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      });
    const interactive = [...document.querySelectorAll('button,a,input,select,textarea')]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
    const tooSmall = interactive.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width < 36 || rect.height < 36;
    }).length;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      viewportHeight,
      fixedBottom,
      tooSmall,
      title: document.title,
      appliedTheme: root.dataset.yosTheme || ''
    };
  });

  assert.equal(metrics.appliedTheme, expectedTheme, `${name}: theme not applied (${metrics.appliedTheme})`);
  assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `${name}: horizontal overflow ${metrics.scrollWidth}/${metrics.clientWidth}`);
  assert.ok(metrics.title.trim().length > 0, `${name}: document title missing`);
  assert.ok(metrics.tooSmall <= 3, `${name}: too many small touch targets (${metrics.tooSmall})`);
  for (const item of metrics.fixedBottom) {
    assert.ok(item.top >= 0, `${name}: fixed bottom navigation exceeds viewport`);
    assert.ok(item.height <= 110, `${name}: fixed bottom navigation too tall (${item.height})`);
  }

  await page.screenshot({ path: `test-results/taxi/${name}-${browserName}.png`, fullPage: true });
}

try {
  for (const theme of themes) {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: THEME_KEY, value: theme });
    for (const [name, relative] of pages) await inspectPage(`${name}-${theme}`, relative, theme);
  }

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Service Worker ready timeout')), 10000))
    ]);
    return { supported: true, active: Boolean(registration.active) };
  });
  assert.equal(sw.supported, true, 'Service Worker unsupported');
  assert.equal(sw.active, true, 'Service Worker not active');

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
  console.log(`Taxi iPhone SE3 smoke passed: ${browserName}`);
} finally {
  await browser.close();
}
