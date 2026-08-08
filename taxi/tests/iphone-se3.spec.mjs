import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const pages = [
  { name: 'drive', path: './index.html', ready: '#shiftButton' },
  { name: 'today', path: './calendar.html', ready: '#todayView' },
  { name: 'week', path: './calendar.html', ready: '#weekView', mode: 'week' },
  { name: 'month', path: './calendar.html', ready: '#monthView', mode: 'month' },
  { name: 'manage', path: './settings.html', ready: '#save' },
];
const artifactRoot = resolve(import.meta.dirname, '../test-results/artifacts');

async function openApp(page, entry) {
  await page.goto(entry.path, { waitUntil: 'domcontentloaded' });

  if (entry.mode) {
    await page.locator(`[data-mode="${entry.mode}"]`).tap();
  }
  await expect(page.locator(entry.ready)).toBeVisible();

  const serviceWorker = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false, active: false };
    const registration = await navigator.serviceWorker.register('./service-worker.js');
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Service Worker ready timeout')), 10000)),
    ]);
    return {
      supported: true,
      active: Boolean(registration.active || registration.waiting || registration.installing),
    };
  });

  expect(serviceWorker).toEqual({ supported: true, active: true });
}

async function expectSe3Layout(page) {
  const layout = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const visible = element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
    };

    const clippedText = [...document.querySelectorAll('main h1, main h2, main h3, main strong, main b, main span, main small')]
      .filter(visible)
      .filter(element => element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).textOverflow !== 'ellipsis')
      .map(element => element.textContent.trim())
      .filter(Boolean)
      .slice(0, 5);

    const isMapAttribution = element => {
      const href = element.getAttribute('href') || '';
      const text = element.textContent || '';
      return Boolean(
        element.closest('.leaflet-control-attribution, .leaflet-control-container') ||
        /openstreetmap\.org/i.test(href) ||
        /OpenStreetMap contributors/i.test(text)
      );
    };

    const tapTargets = [...document.querySelectorAll('main button, main a')]
      .filter(visible)
      .filter(element => !isMapAttribution(element))
      .map(element => {
        const box = element.getBoundingClientRect();
        const critical = element.matches(
          '.action, .link, .minor, .settings, .view-tab, .toolbar button, .edit-button, .week-item, .day, #save, form button'
        );
        return {
          label: element.textContent.trim() || element.getAttribute('aria-label') || element.id,
          id: element.id,
          className: element.className,
          width: box.width,
          height: box.height,
          critical,
        };
      });

    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      clippedText,
      tapTargets,
    };
  });

  expect(layout.documentWidth, 'horizontal scrolling').toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.clippedText, 'unexpected clipped text').toEqual([]);
  for (const target of layout.tapTargets) {
    const minimum = target.critical ? 44 : 39;
    const identifier = [target.label, target.id && `#${target.id}`, target.className && `.${String(target.className).trim().replace(/\s+/g, '.')}`]
      .filter(Boolean)
      .join(' ');
    expect(target.width, `${identifier} tap width`).toBeGreaterThanOrEqual(minimum);
    expect(target.height, `${identifier} tap height`).toBeGreaterThanOrEqual(minimum);
  }
}

test.beforeAll(async () => mkdir(artifactRoot, { recursive: true }));

test.describe('iPhone SE3 viewport and touch smoke', () => {
  for (const entry of pages) {
    test(`${entry.name}: layout, touch, JavaScript and Service Worker`, async ({ page }, testInfo) => {
      const exceptions = [];
      page.on('pageerror', error => exceptions.push(error.message));

      await openApp(page, entry);

      if (entry.name === 'drive') {
        await page.goto('./index.html', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.yos131-primary[data-proxy="shiftButton"]')).toBeVisible();

        const demand = page.locator('.demand-home');
        await expect(demand).toBeVisible();
        await expect(demand).toHaveAttribute('data-demand-state', /^(ready|empty)$/);

        const link = demand.locator('a[href="./demand-calendar.html"]').last();
        await expect(link).toBeVisible();
        const linkBox = await link.boundingBox();
        expect(linkBox?.height, 'demand calendar tap height').toBeGreaterThanOrEqual(44);

        if (await demand.getAttribute('data-demand-state') === 'ready') {
          const source = demand.locator('.demand-source');
          await expect(source).toBeVisible();
          const sourceBox = await source.boundingBox();
          expect(sourceBox?.height, 'official source tap height').toBeGreaterThanOrEqual(44);

          const details = demand.locator('small');
          await details.evaluate(element => {
            element.textContent = '18:00〜21:00｜沖縄市・比屋根・泡瀬周辺の長いエリア名｜需要 高｜信頼度 高';
          });
          await expect(details).toContainText('信頼度 高');
          const detailLayout = await details.evaluate(element => ({
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
          }));
          expect(detailLayout.scrollWidth).toBeLessThanOrEqual(detailLayout.clientWidth + 1);
          expect(detailLayout.scrollHeight).toBeLessThanOrEqual(detailLayout.clientHeight + 1);
        }
      }

      await expectSe3Layout(page);
      expect(exceptions, 'uncaught JavaScript exceptions').toEqual([]);
      await page.screenshot({
        path: resolve(artifactRoot, `${testInfo.project.name}-${entry.name}.png`),
        fullPage: true,
      });
    });
  }
});
