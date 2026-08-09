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
const artifactRoot = resolve(import.meta.dirname, '../test-results/iphone17-artifacts');

async function openIPhone17App(page, entry) {
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
    return { supported: true, active: Boolean(registration.active) };
  });

  expect(serviceWorker).toEqual({ supported: true, active: true });
}

async function expectIPhone17Layout(page) {
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

test.describe('iPhone17 viewport and touch smoke', () => {
  for (const entry of pages) {
    test(`${entry.name}: iPhone17 layout, touch, JavaScript and Service Worker`, async ({ page }, testInfo) => {
      const exceptions = [];
      page.on('pageerror', error => exceptions.push(error.message));

      if (entry.name === 'drive') {
        await page.clock.setFixedTime(new Date('2026-08-09T18:00:00+09:00'));
      }
      await openIPhone17App(page, entry);

      if (entry.name === 'drive') {
        await page.goto('./index.html', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.yos131-drive')).toBeVisible();
        await expect(page.locator('.yos131-primary[data-proxy="shiftButton"]')).toBeVisible();
        expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'controlled second index navigation').toBeTruthy();

        const demand = page.locator('.demand-home');
        await expect(demand).toBeVisible();
        await expect(demand).toHaveAttribute('data-demand-state', 'ready');

        const calendarLink = demand.locator('a[href="./demand-calendar.html"]');
        await expect(calendarLink).toBeVisible();
        await expect(calendarLink).toHaveText('需要カレンダー');
        const calendarLayout = await calendarLink.evaluate(element => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            text: element.textContent.trim(),
            width: box.width,
            height: box.height,
            display: style.display,
            visibility: style.visibility,
            opacity: Number(style.opacity),
            color: style.color,
          };
        });
        expect(calendarLayout.text).toBe('需要カレンダー');
        expect(calendarLayout.width, 'demand calendar tap width').toBeGreaterThanOrEqual(44);
        expect(calendarLayout.height, 'demand calendar tap height').toBeGreaterThanOrEqual(44);
        expect(calendarLayout.display, 'demand calendar display').not.toBe('none');
        expect(calendarLayout.visibility, 'demand calendar visibility').not.toBe('hidden');
        expect(calendarLayout.opacity, 'demand calendar opacity').toBeGreaterThan(0);
        expect(calendarLayout.color, 'demand calendar color').not.toMatch(/rgba?\([^)]*,\s*0\s*\)$/);
        expect(calendarLayout.color, 'demand calendar color').not.toBe('transparent');

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
          bottom: element.getBoundingClientRect().bottom,
          demandBottom: element.closest('.demand-home').getBoundingClientRect().bottom,
        }));
        expect(detailLayout.scrollWidth, 'demand details horizontal clipping').toBeLessThanOrEqual(detailLayout.clientWidth + 1);
        expect(detailLayout.scrollHeight, 'demand confidence vertical clipping').toBeLessThanOrEqual(detailLayout.clientHeight + 1);
        expect(detailLayout.bottom, 'demand details clipped by card').toBeLessThanOrEqual(detailLayout.demandBottom + 1);

        const driveNowLayout = await page.locator('#yos-drive-now-v138').evaluate(bar => {
          const bounds = element => {
            const box = element.getBoundingClientRect();
            return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
          };
          const style = getComputedStyle(bar);
          const tiles = [...bar.children];
          return {
            bar: bounds(bar),
            tiles: tiles.map(bounds),
            destinationPosition: getComputedStyle(bar.querySelector('.destination-v141')).position,
            gridTracks: style.gridTemplateColumns.split(/\s+/).filter(Boolean),
            sales: bounds(document.querySelector('.yos131-sales')),
          };
        });
        expect(driveNowLayout.tiles, 'drive-now direct tile count').toHaveLength(4);
        expect(driveNowLayout.gridTracks, 'drive-now grid column count').toHaveLength(4);
        expect(driveNowLayout.destinationPosition, 'destination must participate in the grid').toBe('static');
        const tileTops = driveNowLayout.tiles.map(tile => tile.top);
        const tileBottoms = driveNowLayout.tiles.map(tile => tile.bottom);
        expect(Math.max(...tileTops) - Math.min(...tileTops), 'drive-now tiles must share one row top').toBeLessThanOrEqual(1);
        expect(Math.max(...tileBottoms) - Math.min(...tileBottoms), 'drive-now tiles must share one row bottom').toBeLessThanOrEqual(1);
        for (const [index, tile] of driveNowLayout.tiles.entries()) {
          expect(tile.top, `drive-now tile ${index + 1} top`).toBeGreaterThanOrEqual(driveNowLayout.bar.top - 1);
          expect(tile.bottom, `drive-now tile ${index + 1} bottom`).toBeLessThanOrEqual(driveNowLayout.bar.bottom + 1);
          if (index > 0) {
            const previous = driveNowLayout.tiles[index - 1];
            expect(tile.left, `drive-now tile ${index + 1} left order`).toBeGreaterThan(previous.left);
            expect(previous.right, `drive-now tiles ${index} and ${index + 1} overlap`).toBeLessThanOrEqual(tile.left + 1);
          }
        }
        for (let left = 0; left < driveNowLayout.tiles.length; left += 1) {
          for (let right = left + 1; right < driveNowLayout.tiles.length; right += 1) {
            const a = driveNowLayout.tiles[left];
            const b = driveNowLayout.tiles[right];
            const overlaps = a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
            expect(overlaps, `drive-now tiles ${left + 1} and ${right + 1} overlap`).toBe(false);
          }
        }
        expect(driveNowLayout.bar.bottom, 'drive-now overlaps sales card').toBeLessThanOrEqual(driveNowLayout.sales.top + 1);

        const primary = page.locator('.yos131-primary[data-proxy="shiftButton"]');
        await expect(primary).toContainText('営業開始');
        await expect(primary.locator('.yos131-primary-hint')).toBeVisible();
        const primaryLayout = await primary.evaluate(button => {
          const sales = button.closest('.yos131-sales');
          const label = button.querySelector('.yos131-primary-label');
          const hint = button.querySelector('.yos131-primary-hint');
          const bounds = element => {
            const box = element.getBoundingClientRect();
            return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, height: box.height, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
          };
          const style = getComputedStyle(button);
          const lineHeight = Number.parseFloat(style.lineHeight);
          const paddingBlock = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
          const borderBlock = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
          return {
            text: label.textContent.trim(), button: bounds(button), sales: bounds(sales), label: bounds(label), hint: bounds(hint),
            scrollHeight: button.scrollHeight, clientHeight: button.clientHeight,
            fontSize: Number.parseFloat(style.fontSize), lineHeight,
            contentHeight: button.getBoundingClientRect().height - paddingBlock - borderBlock,
          };
        });
        expect(primaryLayout.text, 'complete shift start label').toBe('営業開始');
        expect(primaryLayout.button.top, 'primary escapes sales card top').toBeGreaterThanOrEqual(primaryLayout.sales.top - 1);
        expect(primaryLayout.button.bottom, 'primary escapes sales card bottom').toBeLessThanOrEqual(primaryLayout.sales.bottom + 1);
        expect(primaryLayout.scrollHeight, 'primary vertical clipping').toBeLessThanOrEqual(primaryLayout.clientHeight + 1);
        expect(primaryLayout.lineHeight, 'primary line-height').toBeGreaterThanOrEqual(primaryLayout.fontSize);
        expect(primaryLayout.lineHeight, 'primary line box').toBeLessThanOrEqual(primaryLayout.contentHeight + 1);
        for (const [name, bounds] of Object.entries({ label: primaryLayout.label, hint: primaryLayout.hint })) {
          expect(bounds.top, `${name} escapes primary top`).toBeGreaterThanOrEqual(primaryLayout.button.top - 1);
          expect(bounds.bottom, `${name} escapes primary bottom`).toBeLessThanOrEqual(primaryLayout.button.bottom + 1);
          expect(bounds.left, `${name} escapes primary left`).toBeGreaterThanOrEqual(primaryLayout.button.left - 1);
          expect(bounds.right, `${name} escapes primary right`).toBeLessThanOrEqual(primaryLayout.button.right + 1);
          expect(bounds.scrollHeight, `${name} vertical clipping`).toBeLessThanOrEqual(bounds.clientHeight + 1);
        }

        const opsLoop = page.locator('.yos-ops-loop');
        const opsSummary = opsLoop.locator('summary');
        await expect(opsLoop).toBeVisible();
        await expect(opsSummary).toBeVisible();
        const closedOpsLayout = await opsLoop.evaluate(details => {
          const box = element => {
            const bounds = element.getBoundingClientRect();
            return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left };
          };
          return {
            details: box(details),
            summary: box(details.querySelector('summary')),
            cell: box(details.closest('.yos131-header > div:first-child')),
            header: box(details.closest('.yos131-header')),
            driveNow: box(document.querySelector('#yos-drive-now-v138')),
          };
        });
        for (const [name, bounds] of Object.entries({ details: closedOpsLayout.details, summary: closedOpsLayout.summary })) {
          expect(bounds.top, `${name} escapes header cell top`).toBeGreaterThanOrEqual(closedOpsLayout.cell.top - 1);
          expect(bounds.bottom, `${name} escapes header cell bottom`).toBeLessThanOrEqual(closedOpsLayout.cell.bottom + 1);
          expect(bounds.left, `${name} escapes header cell left`).toBeGreaterThanOrEqual(closedOpsLayout.cell.left - 1);
          expect(bounds.right, `${name} escapes header cell right`).toBeLessThanOrEqual(closedOpsLayout.cell.right + 1);
        }
        expect(closedOpsLayout.header.bottom, 'header overlaps drive-now').toBeLessThanOrEqual(closedOpsLayout.driveNow.top + 1);

        await opsSummary.tap();
        await expect(opsLoop).toHaveAttribute('open', '');
        await expect(opsLoop.getByText('確信度', { exact: true })).toBeVisible();
        const openOpsLayout = await opsLoop.evaluate(details => {
          const box = details.getBoundingClientRect();
          const confidence = [...details.querySelectorAll('.yos-ops-row')].find(row => row.textContent.includes('確信度'))?.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            scrollWidth: details.scrollWidth,
            clientWidth: details.clientWidth,
            confidenceVisible: Boolean(confidence && confidence.width > 0 && confidence.height > 0),
          };
        });
        expect(openOpsLayout.left, 'open ops loop escapes viewport left').toBeGreaterThanOrEqual(0);
        expect(openOpsLayout.right, 'open ops loop escapes viewport right').toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
        expect(openOpsLayout.scrollWidth, 'open ops loop horizontal overflow').toBeLessThanOrEqual(openOpsLayout.clientWidth + 1);
        expect(openOpsLayout.confidenceVisible, 'open ops loop primary content').toBe(true);
        await opsSummary.tap();

        const driveLayout = await page.locator('.yos131-drive').evaluate(element => {
          const box = element.getBoundingClientRect();
          const navTop = document.querySelector('.yos131-nav')?.getBoundingClientRect().top ?? innerHeight;
          const children = [...element.children].map(child => ({
            className: child.className,
            bottom: child.getBoundingClientRect().bottom,
          }));
          const actions = element.querySelector('.yos131-actions')?.getBoundingClientRect();
          return {
            bottom: box.bottom,
            navTop,
            children,
            actionsHeight: actions?.height ?? 0,
            tracks: getComputedStyle(element).gridTemplateRows.split(/\s+/).filter(Boolean),
          };
        });
        expect(driveLayout.tracks, 'drive must define all seven demand rows').toHaveLength(7);
        expect(driveLayout.bottom, 'drive must stay above navigation').toBeLessThanOrEqual(driveLayout.navTop + 1);
        for (const child of driveLayout.children) {
          expect(child.bottom, `${child.className} exceeds drive boundary`).toBeLessThanOrEqual(driveLayout.bottom + 1);
          expect(child.bottom, `${child.className} overlaps navigation`).toBeLessThanOrEqual(driveLayout.navTop + 1);
        }
        expect(driveLayout.actionsHeight, 'actions track expanded abnormally').toBeLessThanOrEqual(80);
      }

      await expectIPhone17Layout(page);
      expect(exceptions, 'uncaught JavaScript exceptions').toEqual([]);
      await page.screenshot({
        path: resolve(artifactRoot, `${testInfo.project.name}-${entry.name}.png`),
        fullPage: true,
      });
    });
  }

  test('drive: planned start blocks one second early and opens at the exact second', async ({ page }) => {
    const exceptions = [];
    page.on('pageerror', error => exceptions.push(error.message));
    await page.clock.setFixedTime(new Date('2026-08-09T18:45:59+09:00'));
    await page.addInitScript(() => {
      localStorage.setItem('yos-taxi-ops-v1', JSON.stringify({
        businessDate: '2026-08-09', status: 'before', shiftStart: null, shiftEnd: null,
        activeRide: null, breakStart: null, availableSince: null, events: [], updatedAt: 'seed',
      }));
      localStorage.setItem('yos-taxi-settings-v2', JSON.stringify({
        targetSales: 30000, vehicle: '521', plannedStart: '18:46', plannedEnd: '03:30', areas: '那覇', yosUrl: '',
      }));
    });
    await page.goto('./index.html', { waitUntil: 'domcontentloaded' });
    const hidden = page.locator('#shiftButton');
    const visible = page.locator('.yos131-primary[data-proxy="shiftButton"]');
    await expect(hidden).toBeDisabled();
    await expect(visible).toBeDisabled();
    await expect(visible).toContainText('営業開始');
    await expect(visible).toContainText('18:46になったらタップ可能');
    const beforeStorage = await page.evaluate(() => localStorage.getItem('yos-taxi-ops-v1'));
    await visible.dispatchEvent('click');
    await hidden.dispatchEvent('click');
    expect(await page.evaluate(() => localStorage.getItem('yos-taxi-ops-v1'))).toBe(beforeStorage);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yos-taxi-ops-v1')))).toMatchObject({ status: 'before', shiftStart: null, events: [] });
    page.on('dialog', dialog => dialog.accept());
    await page.clock.setFixedTime(new Date('2026-08-09T18:46:00+09:00'));
    await page.clock.runFor(1000);
    await expect(hidden).toBeEnabled();
    await expect(visible).toBeEnabled();
    await expect(visible).toContainText('営業開始できます');
    await visible.tap();
    const started = await page.evaluate(() => JSON.parse(localStorage.getItem('yos-taxi-ops-v1')));
    expect(started.status).toBe('available');
    expect(started.shiftStart).toBeTruthy();
    expect(started.events.filter(event => event.type === '営業開始')).toHaveLength(1);
    expect(exceptions, 'uncaught JavaScript exceptions').toEqual([]);
  });
});
