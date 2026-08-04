import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const pages = [
  ['drive', './index.html', '.yos131-drive'],
  ['today', './calendar.html?page=today', '.yos131-today'],
  ['week', './calendar.html?page=week', '.yos131-week'],
  ['month', './calendar.html?page=month', '.yos131-month'],
  ['manage', './calendar.html?page=manage', '.yos131-manage'],
];
const themes = ['minimal', 'night-gold', 'light', 'map', 'hud'];
const artifactRoot = resolve(import.meta.dirname, '../test-results/artifacts');

async function openControlled(page, path, readySelector) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => navigator.serviceWorker?.ready);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))) break;
    await page.reload();
    await page.waitForLoadState('networkidle');
  }
  await expect(page.locator(readySelector)).toBeVisible();
}

async function expectSe3Layout(page) {
  const layout = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const nav = document.querySelector('.yos131-nav');
    const visible = element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
    };
    const clippedText = [...document.querySelectorAll('.yos131-page h1,.yos131-page h2,.yos131-page strong,.yos131-page b,.yos131-page span,.yos131-page small')]
      .filter(visible)
      .filter(element => element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).textOverflow !== 'ellipsis')
      .map(element => element.textContent.trim()).filter(Boolean).slice(0, 5);
    const navBox = nav?.getBoundingClientRect();
    const contentBottom = Math.max(0, ...[...document.querySelectorAll('.yos131-page button,.yos131-page a,.yos131-page section')]
      .filter(visible).map(element => element.getBoundingClientRect().bottom));
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      clippedText,
      navOverlap: Boolean(navBox && contentBottom > navBox.top + 1),
      navTargets: [...(nav?.querySelectorAll('button') || [])].map(button => {
        const box = button.getBoundingClientRect();
        return { label: button.textContent.trim(), width: box.width, height: box.height };
      }),
    };
  });
  expect(layout.documentWidth, 'horizontal scrolling').toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.clippedText, 'unexpected clipped text').toEqual([]);
  expect(layout.navOverlap, 'content hidden under bottom menu').toBeFalsy();
  for (const target of layout.navTargets) {
    expect(target.width, `${target.label} tap width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} tap height`).toBeGreaterThanOrEqual(44);
  }
}

test.beforeAll(async () => mkdir(artifactRoot, { recursive: true }));

test.describe('iPhone SE3 viewport and touch smoke', () => {
  for (const [name, path, selector] of pages) {
    test(`${name}: layout, touch, JavaScript and Service Worker`, async ({ page }, testInfo) => {
      const exceptions = [];
      page.on('pageerror', error => exceptions.push(error.message));
      await openControlled(page, path, selector);
      const serviceWorker = await page.evaluate(() => ({ supported: 'serviceWorker' in navigator, controlled: Boolean(navigator.serviceWorker?.controller) }));
      expect(serviceWorker).toEqual({ supported: true, controlled: true });
      await expectSe3Layout(page);

      const active = page.locator('.yos131-nav button.active');
      await expect(active).toHaveCount(1);
      await active.tap();
      await page.waitForLoadState('domcontentloaded');
      expect(exceptions, 'uncaught JavaScript exceptions').toEqual([]);
      await page.screenshot({ path: resolve(artifactRoot, `${testInfo.project.name}-${name}.png`), fullPage: true });
    });
  }

  test('all five themes render without regression', async ({ page }, testInfo) => {
    const exceptions = [];
    page.on('pageerror', error => exceptions.push(error.message));
    await openControlled(page, './calendar.html?page=manage', '.yos131-manage');

    for (const theme of themes) {
      await page.locator('[data-theme-open]').tap();
      const choice = page.locator(`#yos-theme-v137 [data-theme="${theme}"]`);
      await expect(choice).toBeVisible();
      await choice.tap();
      await expect(page.locator('html')).toHaveAttribute('data-yos-theme', theme);
      await expectSe3Layout(page);
      await page.screenshot({ path: resolve(artifactRoot, `${testInfo.project.name}-theme-${theme}.png`), fullPage: true });
      await page.locator('[data-theme-close]').last().tap();
    }
    expect(exceptions, 'uncaught JavaScript exceptions').toEqual([]);
  });
});
