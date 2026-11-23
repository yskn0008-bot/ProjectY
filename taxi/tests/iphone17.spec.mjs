import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const pages = [
  { name: 'drive', path: './index.html?legacy=1', ready: '.yos131-primary[data-proxy="shiftButton"]' },
  { name: 'today', path: './calendar.html', ready: '#todayView' },
  { name: 'week', path: './calendar.html', ready: '#weekView', mode: 'week' },
  { name: 'month', path: './calendar.html', ready: '#monthView', mode: 'month' },
  { name: 'manage', path: './settings.html', ready: '#save' },
  { name: 'goal', path: './revenue-goal.html', ready: '#neededDaily' },
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
        await page.goto('./index.html?legacy=1', { waitUntil: 'domcontentloaded' });
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
            return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
          };
          return { button: bounds(button), sales: bounds(sales), label: bounds(label), hint: bounds(hint) };
        });
        expect(primaryLayout.button.top, 'primary escapes sales card top').toBeGreaterThanOrEqual(primaryLayout.sales.top - 1);
        expect(primaryLayout.button.bottom, 'primary escapes sales card bottom').toBeLessThanOrEqual(primaryLayout.sales.bottom + 1);
        expect(primaryLayout.button.scrollHeight, 'primary vertical clipping').toBeLessThanOrEqual(primaryLayout.button.clientHeight + 1);
        for (const [name, bounds] of Object.entries({ label: primaryLayout.label, hint: primaryLayout.hint })) {
          expect(bounds.top, `${name} escapes primary top`).toBeGreaterThanOrEqual(primaryLayout.button.top - 1);
          expect(bounds.bottom, `${name} escapes primary bottom`).toBeLessThanOrEqual(primaryLayout.button.bottom + 1);
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

  test('drive: planned start proxy exists before the boundary and opens at the exact second', async ({ page }) => {
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
    await page.goto('./index.html?legacy=1', { waitUntil: 'domcontentloaded' });

    const hidden = page.locator('#shiftButton');
    const proxy = page.locator('.yos131-primary[data-proxy="shiftButton"]');
    await expect(hidden).toBeDisabled();
    await expect(proxy).toBeVisible();
    await expect(proxy).toBeDisabled();
    await expect(proxy).toContainText('18:46になったらタップ可能');
    const beforeStorage = await page.evaluate(() => localStorage.getItem('yos-taxi-ops-v1'));
    await proxy.dispatchEvent('click');
    await hidden.dispatchEvent('click');
    expect(await page.evaluate(() => localStorage.getItem('yos-taxi-ops-v1'))).toBe(beforeStorage);

    await page.clock.setFixedTime(new Date('2026-08-09T18:46:00+09:00'));
    await page.clock.runFor(1000);
    await expect(hidden).toBeEnabled();
    await expect(proxy).toBeEnabled();
    await expect(proxy).toContainText('営業開始できます');
    expect(exceptions, 'uncaught JavaScript exceptions').toEqual([]);
  });
});


test('default entry: approved one-screen UI and legacy recovery', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./index.html', {waitUntil:'domcontentloaded'});
  await expect(page).toHaveURL(/\/ui-v2\.html$/);
  await expect(page.locator('#drop-btn')).toBeVisible();
  await expect(page.locator('#photo-btn')).toBeVisible();
  await expect(page.locator('#sync-status')).toContainText('Notion未接続');
  const pageOverflow=await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1);
  expect(pageOverflow).toBe(false);
  await page.locator('[data-page="strategy"]').click();
  await expect(page.locator('#strategy-view')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1)).toBe(false);
  await page.locator('[data-page="history"]').click();
  await page.locator('#history-info-btn').click();
  await expect(page).toHaveURL(/\/index\.html\?legacy=1$/);
  await expect(page.locator('.yos131-primary[data-proxy="shiftButton"]')).toBeVisible();
  expect(errors).toEqual([]);
});


test('v2 in-app browser heights: all sales text and strategy rows fit their boxes', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-11-17T17:01:00+09:00'));
  for (const [width,height] of [[393,650],[393,631],[320,568],[320,650],[375,700],[390,799],[402,874]]) {
    await page.setViewportSize({width,height});
    await page.goto('./ui-v2.html', {waitUntil:'domcontentloaded'});
    // compact cockpit primary hierarchy: one current period and two verified counters.
    const cockpit=await page.evaluate(() => {
      const visible=e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0;
      return {
        periodRows:[...document.querySelectorAll('.period')].filter(visible).length,
        kpiCells:[...document.querySelectorAll('.kpis>div')].filter(visible).length,
        dropFont:parseFloat(getComputedStyle(document.querySelector('#drop-btn .copy b')).fontSize),
        statusFont:parseFloat(getComputedStyle(document.querySelector('.status-label')).fontSize),
      };
    });
    expect(cockpit.periodRows,'only current time band shown').toBe(1);
    expect(cockpit.kpiCells,'only measured counters shown').toBe(2);
    expect(cockpit.dropFont,'primary action must remain legible').toBeGreaterThanOrEqual(width<=350?12:16);
    expect(cockpit.statusFont,'shift status must remain legible').toBeGreaterThanOrEqual(width<=350?15:17);
    await expect(page.locator('#photo-btn')).toContainText('経過日報を送る');
    let problems = await page.evaluate(() => {
      const items=[...document.querySelectorAll('.quick .copy b,.quick .copy small,.decision strong,.decision span,.period b,.period small,.kpi-label,.kpi-value,.footer-card span')];
      const active = element => {const style=getComputedStyle(element);return style.display!=='none' && style.visibility!=='hidden' && element.getBoundingClientRect().height>0};
      const bad=items.filter(active).filter(element=>element.scrollWidth>element.clientWidth+1 || element.scrollHeight>element.clientHeight+2).map(element=>element.textContent.trim());
      const main=document.querySelector('.view.active');
      if(main.scrollHeight>main.clientHeight+2)bad.push('sales main internally overflowing');
      return bad;
    });
    expect(problems, 'sales text overflow at '+width+'x'+height).toEqual([]);
    await page.locator('[data-page="strategy"]').click();
    await expect(page.locator('.strat-row.selected')).toHaveAttribute('data-strat','0');
    problems=await page.evaluate(() => {
      const bad=[];
      const rows=[...document.querySelectorAll('.strat-row')];
      rows.forEach((row,i) => {
        const container=row.getBoundingClientRect();
        for(const selector of ['time','b','small']){
          const child=row.querySelector(selector),rect=child.getBoundingClientRect();
          // Secondary detail is intentionally hidden on the compact large-type view.
          if(getComputedStyle(child).display==='none'||!rect.width||!rect.height)continue;
          if(rect.top<container.top-0.6 || rect.bottom>container.bottom+0.6 || rect.left<container.left-1 || rect.right>container.right+1)
            bad.push(i+' '+selector+' is outside its row');
          if(child.scrollWidth>child.clientWidth+1 || child.scrollHeight>child.clientHeight+2)
            bad.push(i+' '+selector+' text clipped');
        }
      });
      const main=document.querySelector('.view.active');
      // Strategy intentionally scrolls vertically so new wait controls remain readable on compact iPhones.
      if(main.scrollHeight>main.clientHeight+2 && getComputedStyle(main).overflowY!=='auto')bad.push('strategy main overflowing without scroll');
      if(document.documentElement.scrollHeight>innerHeight+1)bad.push('page scroll');
      return bad;
    });
    expect(problems,'strategy text overlap at '+width+'x'+height).toEqual([]);
  }
});


test('M100: safe-stop checklist opens without changing ride records or viewport', async ({page}) => {
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  for(const [width,height] of [[320,568],[393,650],[402,874]]){
    await page.setViewportSize({width,height});
    await page.goto('./ui-v2.html',{waitUntil:'domcontentloaded'});
    const before=await page.evaluate(() => localStorage.getItem('yos-taxi-ui-v2-live-20261117'));
    await page.locator('[data-page="strategy"]').click();
    const btn=page.locator('#m100-rule-btn');
    await expect(btn).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight+1)).toBe(false);
    await btn.click();
    await expect(page.locator('#modal.m100-open')).toBeVisible();
    await expect(page.locator('#modal-title')).toContainText('M100');
    for(const n of [1,2,3,4,5,6])await expect(page.locator('#modal-body')).toContainText(n+'｜');
    await expect(page.locator('#modal-body')).toContainText('自動学習はまだ行いません');
    await expect(page.locator('#modal-body')).toContainText('強制移動ではない');
    await page.locator('#close-modal').click();
    await expect(page.locator('#modal')).not.toBeVisible();
    await page.locator('[data-page="sales"]').click();
    await expect(page.locator('#drop-btn')).toBeVisible();
    await expect(page.locator('#photo-btn')).toBeVisible();
    const after=await page.evaluate(() => localStorage.getItem('yos-taxi-ui-v2-live-20261117'));
    expect(after,'M100 guidance must not mutate shift or ride records').toBe(before);
  }
  expect(errors).toEqual([]);
});


test('Taxi Shortcuts: locked/home widgets use same local shift and retry-safe dropoff', async ({page,browser}) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-19T17:15:00+09:00'));
  const id='20261119171500-345671';
  const state=()=>page.evaluate(()=>window.YOSTaxiPreview.debugState());
  await page.goto('./ui-v2.html?yos_action=dropoff&yos_req='+id,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#modal-title')).toContainText('降車は記録していません');
  expect((await state()).events).toHaveLength(0);
  expect(page.url()).not.toContain('yos_action');
  await page.goto('./ui-v2.html?yos_action=start',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#modal-title')).toContainText('営業を開始');
  await page.locator('#modal-actions .primary').click();
  expect((await state()).events).toHaveLength(1);
  await page.goto('./ui-v2.html?yos_action=dropoff&yos_req='+id,{waitUntil:'domcontentloaded'});
  expect((await state()).events).toHaveLength(2);
  const recorded=(await state()).events.at(-1);
  expect(recorded.shortcutRequestId).toBe(id);
  expect(new Date(recorded.at).getTime()).toBe(new Date('2026-11-19T08:15:00.000Z').getTime());
  await page.reload();
  expect((await state()).events).toHaveLength(2);
  await page.goto('./ui-v2.html?yos_action=dropoff&yos_req='+id,{waitUntil:'domcontentloaded'});
  expect((await state()).events).toHaveLength(2);
  await page.goto('./ui-v2.html?yos_action=dropoff&yos_req=invalid',{waitUntil:'domcontentloaded'});
  expect((await state()).events).toHaveLength(2);
  await expect(page.locator('#modal-title')).toContainText('降車は記録していません');
  await page.clock.setFixedTime(new Date('2026-11-19T17:20:00+09:00'));
  await page.goto('./ui-v2.html?yos_action=dropoff&yos_req=20261119171000-882200',{waitUntil:'domcontentloaded'});
  expect((await state()).events).toHaveLength(2);
  await expect(page.locator('#modal-title')).toContainText('降車は記録していません');
  await page.goto('./ui-v2.html?yos_action=end',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#modal-title')).toContainText('営業終了');
  await page.locator('#modal-actions .primary').click();
  expect((await state()).events).toHaveLength(3);
  await page.goto('./ui-v2.html?yos_action=dropoff&yos_req=20261119172000-991122',{waitUntil:'domcontentloaded'});
  expect((await state()).events).toHaveLength(3);
  await expect(page.locator('#modal-title')).toContainText('降車は記録していません');
  // Safari and Home Screen PWA can have isolated storage. Never write to a new one.
  const separate=await browser.newContext({timezoneId:'Asia/Tokyo'});
  const other=await separate.newPage();
  await other.clock.setFixedTime(new Date('2026-11-19T17:15:00+09:00'));
  await other.goto(new URL('./ui-v2.html?yos_action=dropoff&yos_req=20261119171500-221133',page.url()).href,{waitUntil:'domcontentloaded'});
  await expect(other.locator('#modal-title')).toContainText('降車は記録していません');
  expect(await other.evaluate(()=>window.YOSTaxiPreview.debugState().events.length)).toBe(0);
  await separate.close();
  expect(errors).toEqual([]);
});


test('Dropoff result is persistent and clearly confirms success, retry and failure', async ({page}) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:320,height:568});
  await page.clock.setFixedTime(new Date('2026-11-19T17:15:00+09:00'));
  const eventCount=()=>page.evaluate(()=>window.YOSTaxiPreview.debugState().events.filter(e=>e.type==='dropoff').length);
  await page.goto('./ui-v2.html',{waitUntil:'domcontentloaded'});
  await page.locator('#drop-btn').click();
  await expect(page.locator('#modal.dropoff-result-error')).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('降車は記録していません');
  await expect(page.locator('#dropoff-outcome-badge')).toHaveText('保存なし');
  await expect(page.locator('#dropoff-outcome-time')).toHaveText('未記録');
  await expect(page.locator('#dropoff-outcome-count')).toHaveText('本日の降車記録 0件');
  expect(await eventCount()).toBe(0);
  await page.goto('./ui-v2.html?yos_action=start',{waitUntil:'domcontentloaded'});
  await page.locator('#modal-actions .primary').click();
  await page.locator('#drop-btn').click();
  await expect(page.locator('#modal.dropoff-result-success')).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('降車を記録しました');
  await expect(page.locator('#dropoff-outcome-badge')).toHaveText('保存完了');
  await expect(page.locator('#dropoff-outcome-time')).toHaveText('降車 17:15:00');
  await expect(page.locator('#dropoff-outcome-count')).toHaveText('本日の降車記録 1件');
  await expect(page.locator('#modal-body')).toContainText('Notionとは未同期');
  const sizes=await page.locator('#modal').evaluate(node=>{
    const sheet=node.querySelector('.sheet').getBoundingClientRect();
    const stamp=node.querySelector('#dropoff-outcome-time');
    return {font:parseFloat(getComputedStyle(stamp).fontSize),bottom:sheet.bottom,top:sheet.top};
  });
  expect(sizes.font).toBeGreaterThanOrEqual(30);
  expect(sizes.bottom).toBeLessThanOrEqual(569);
  expect(sizes.top).toBeGreaterThanOrEqual(-1);
  await page.waitForTimeout(3200);
  await expect(page.locator('#modal.dropoff-result-success')).toBeVisible();
  await page.locator('#modal-actions button').first().click();
  await expect(page.locator('#modal')).toBeHidden();
  await page.locator('#drop-btn').click();
  await expect(page.locator('#modal.dropoff-result-duplicate')).toBeVisible();
  await expect(page.locator('#modal-title')).toContainText('追加なし');
  await expect(page.locator('#dropoff-outcome-count')).toHaveText('本日の降車記録 1件');
  expect(await eventCount()).toBe(1);

  await page.clock.setFixedTime(new Date('2026-11-19T17:20:00+09:00'));
  const id='20261119172000-123456';
  await page.goto('./ui-v2.html?yos_action=dropoff&yos_req='+id,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#modal.dropoff-result-success')).toBeVisible();
  await expect(page.locator('#dropoff-outcome-time')).toHaveText('降車 17:20:00');
  await expect(page.locator('#dropoff-outcome-count')).toHaveText('本日の降車記録 2件');
  expect(await eventCount()).toBe(2);
  await page.reload();
  await expect(page.locator('#modal')).toBeHidden();
  expect(await eventCount()).toBe(2);
  await page.goto('./ui-v2.html?yos_action=dropoff&yos_req='+id,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#modal.dropoff-result-duplicate')).toBeVisible();
  await expect(page.locator('#dropoff-outcome-time')).toHaveText('降車 17:20:00');
  await expect(page.locator('#dropoff-outcome-count')).toHaveText('本日の降車記録 2件');
  expect(await eventCount()).toBe(2);

  await page.goto('./ui-v2.html?yos_action=dropoff&yos_req=invalid',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#modal.dropoff-result-error')).toBeVisible();
  await expect(page.locator('#dropoff-outcome-badge')).toHaveText('保存なし');
  expect(await eventCount()).toBe(2);
  expect(errors).toEqual([]);
});


test('YOS TAXI workflow links: read-only history and analysis do not alter shift records', async ({page}) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-19T18:30:00+09:00'));
  await page.goto('./ui-v2.html',{waitUntil:'domcontentloaded'});
  const original=await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'));
  await page.goto('./ui-v2.html?yos_action=history',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#history-view')).toBeVisible();
  expect(page.url()).not.toContain('yos_action');
  const afterHistory=await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'));
  expect(afterHistory).toBe(original);
  await page.goto('./ui-v2.html?yos_action=analysis',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#analysis-view')).toBeVisible();
  expect(page.url()).not.toContain('yos_action');
  const afterAnalysis=await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'));
  expect(afterAnalysis).toBe(original);
  expect(errors).toEqual([]);
});


test('Taxi research: official forecast displays separate publication, retrieval and target times without touching shift data', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-19T21:00:00+09:00'));
  await page.route('https://www.jma.go.jp/bosai/forecast/data/forecast/471000.json',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
      publishingOffice:'沖縄気象台',reportDatetime:'2026-11-19T17:00:00+09:00',
      timeSeries:[{timeDefines:['2026-11-19T17:00:00+09:00','2026-11-20T00:00:00+09:00'],
      areas:[{area:{name:'本島中南部',code:'471010'},weathers:['くもり','雨　夜遅く晴れ']}]}]
    }])});
  });
  await page.goto('./research.html?phase=before',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#phase-before')).toHaveAttribute('aria-pressed','true');
  await page.locator('#weather-fetch').click();
  await expect(page.locator('#weather-status')).toHaveText('公式予報を取得');
  // 21:00 belongs to the forecast period which started at 17:00, not the next 00:00 slot.
  await expect(page.locator('#weather-report')).toContainText('くもり');
  await expect(page.locator('#weather-report')).not.toContainText('雨　夜遅く晴れ');
  await expect(page.locator('#weather-meta')).toContainText('発表');
  await expect(page.locator('#weather-meta')).toContainText('取得');
  await expect(page.locator('#weather-meta')).toContainText('予報期間開始');
  expect(await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'))).toBeNull();
  // Once midnight has passed, the 00:00 slot becomes the active forecast period.
  await page.clock.setFixedTime(new Date('2026-11-20T01:00:00+09:00'));
  await page.locator('#weather-fetch').click();
  await expect(page.locator('#weather-report')).toContainText('雨　夜遅く晴れ');
  await page.locator('#phase-during').click();
  await expect(page.locator('#phase-during')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#weather-status')).toHaveText('公式予報を取得');
  expect(errors).toEqual([]);
});

test('Taxi research: outdated official publication is explicitly expired even after a successful HTTP fetch',async ({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-19T21:00:00+09:00'));
  await page.route('https://www.jma.go.jp/bosai/forecast/data/forecast/471000.json',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
      publishingOffice:'沖縄気象台',reportDatetime:'2026-11-18T05:00:00+09:00',
      timeSeries:[{timeDefines:['2026-11-19T21:00:00+09:00'],areas:[{area:{code:'471010'},weathers:['晴れ']}]}]
    }])});
  });
  await page.goto('./research.html?phase=during',{waitUntil:'domcontentloaded'});
  await page.locator('#weather-fetch').click();
  await expect(page.locator('#weather-status')).toHaveText('期限切れ');
  await expect(page.locator('#weather-report')).not.toContainText('晴れ');
  await expect(page.locator('#weather-report')).toContainText('最新とは扱わず');
});

test('Taxi research: HTTP error / malformed data never becomes current conditions or shift writes',async ({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-19T21:00:00+09:00'));
  await page.route('https://www.jma.go.jp/bosai/forecast/data/forecast/471000.json',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
      publishingOffice:'沖縄気象台',reportDatetime:'2026-11-19T17:00:00+09:00',
      timeSeries:[{timeDefines:['2026-11-20T00:00:00+09:00'],areas:[{area:{code:'999999'},weathers:['晴れ']}]}]
    }])});
  });
  await page.goto('./research.html',{waitUntil:'domcontentloaded'});
  await page.locator('#weather-fetch').click();
  await expect(page.locator('#weather-status')).toHaveText('未取得');
  await expect(page.locator('#weather-report')).toContainText('公開データの内容・時刻が確認条件に合いませんでした');
  expect(await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'))).toBeNull();
});


test('Taxi research redesign: compact first viewport, expandable sources and automatic forecast retrieval',async ({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-19T21:00:00+09:00'));
  await page.setViewportSize({width:390,height:844});
  let hits=0;
  await page.route('https://www.jma.go.jp/bosai/forecast/data/forecast/471000.json',async route=>{
    hits++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
      publishingOffice:'沖縄気象台',reportDatetime:'2026-11-19T17:00:00+09:00',
      timeSeries:[{timeDefines:['2026-11-19T17:00:00+09:00'],
      areas:[{area:{code:'471010'},weathers:['くもり']}]}]
    }])});
  });
  await page.goto('./research.html?phase=during',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#phase-during')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#weather-status')).toHaveText('公式予報を取得');
  expect(hits).toBe(1);
  const positions=await page.evaluate(()=>{
    const rect=selector=>document.querySelector(selector).getBoundingClientRect();
    return {pageWidth:document.documentElement.scrollWidth,screenWidth:innerWidth,
    header:rect('header').bottom,
    decision:rect('.decision').bottom,
    auto:rect('#auto-research').top,
    weather:rect('#weather-section').bottom,
    sources:rect('#official-sources').top};
  });
  expect(positions.pageWidth).toBeLessThanOrEqual(positions.screenWidth);
  expect(positions.decision).toBeLessThan(380);
  expect(positions.auto).toBeLessThan(770);
  expect(positions.auto).toBeLessThan(positions.weather);
  expect(positions.sources).toBeGreaterThan(positions.weather); // Scheduled source card is now between weather and manual links.
  const road=page.locator('#official-sources details').first();
  await expect(road).not.toHaveAttribute('open','');
  await road.locator('summary').click();
  await expect(road).toHaveAttribute('open','');
  await expect(road.locator('a')).toHaveAttribute('href','https://www.jartic.or.jp/');
  await expect(page.locator('.decision')).toContainText('未判定');
  expect(await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'))).toBeNull();
  expect(errors).toEqual([]);
});

test('Taxi research redesign: forecast automatically becomes stale after 15 minutes, without false current data',async ({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-19T21:00:00+09:00'));
  await page.route('https://www.jma.go.jp/bosai/forecast/data/forecast/471000.json',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
      publishingOffice:'沖縄気象台',reportDatetime:'2026-11-19T17:00:00+09:00',
      timeSeries:[{timeDefines:['2026-11-19T17:00:00+09:00'],areas:[{area:{code:'471010'},weathers:['くもり']}]}]
    }])});
  });
  await page.goto('./research.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#weather-status')).toHaveText('公式予報を取得');
  await page.clock.setFixedTime(new Date('2026-11-19T21:16:00+09:00'));
  await page.evaluate(()=>window.YOSTaxiResearchTest.revalidate());
  await expect(page.locator('#weather-status')).toHaveText('要再確認');
  await expect(page.locator('#weather-report')).not.toContainText('くもり');
  await expect(page.locator('#weather-report')).toContainText('15分以上');
});


test('Taxi research LIVE verification of JMA data from a browser without mocked network',async ({page},testInfo)=>{
  const endpoint='https://www.jma.go.jp/bosai/forecast/data/forecast/471000.json';
  const responses=[];const failedRequests=[];
  page.on('response',r=>{
    if(r.url().startsWith(endpoint)){
      responses.push({http:r.status(),type:r.headers()['content-type']||'',cors:r.headers()['access-control-allow-origin']||''});
    }
  });
  page.on('requestfailed',r=>{
    if(r.url().startsWith(endpoint))failedRequests.push(r.failure()?.errorText||'request failed');
  });
  await page.goto('./research.html?phase=during',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#weather-fetch')).toBeEnabled({timeout:15000});
  const state=(await page.locator('#weather-status').innerText()).trim();
  const message=(await page.locator('#weather-report').innerText()).trim();
  const metadata=(await page.locator('#weather-meta').innerText()).trim();
  // This is an evidence-gathering probe, NOT a gate that mistakes network restrictions
  // on a GitHub runner for an application regression or claims production iPhone success.
  expect(['公式予報を取得','期限切れ','未取得']).toContain(state);
  if(state==='公式予報を取得'){
    expect(metadata).toContain('発表');
    expect(metadata).toContain('取得');
    expect(metadata).toContain('予報期間開始');
  }else{
    expect(message).toMatch(/公式ページ|最新とは扱わず/);
  }
  const result={browser:testInfo.project.name,status:state,when:new Date().toISOString(),responses,
    failedRequests,reason:state==='未取得'?message.slice(0,120):'',
    metadata:state==='公式予報を取得'?metadata:''};
  console.log('YOS_JMA_LIVE_PROBE '+JSON.stringify(result));
  await testInfo.attach('yos-jma-live-probe.json',{body:Buffer.from(JSON.stringify(result,null,2)),contentType:'application/json'});
  expect(await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'))).toBeNull();
});


test('Taxi shift briefing: 2026-11-21 10:00 start shows verified official schedules and expires afterward',async ({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00+09:00'));
  await page.route('https://www.jma.go.jp/bosai/forecast/data/forecast/471000.json',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
      publishingOffice:'沖縄気象台',reportDatetime:'2026-11-20T08:00:00+09:00',
      timeSeries:[{timeDefines:['2026-11-20T06:00:00+09:00'],
        areas:[{area:{code:'471010'},weathers:['くもり']}]}]
    }])});
  });
  await page.goto('./research.html?phase=before',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#shift-brief')).toBeVisible();
  await expect(page.locator('header h1')).toHaveText('営業リサーチ');
  await expect(page.locator('#shift-brief')).toContainText('11/21（土）10:00出庫');
  await expect(page.locator('#shift-brief')).toContainText('宜野湾市産業まつり');
  await expect(page.locator('#shift-brief')).toContainText('日米対抗ソフトボール');
  await expect(page.locator('#shift-brief')).toContainText('FRUITS ZIPPER');
  await expect(page.locator('#shift-brief')).toContainText('乗車需要は未確認');
  await expect(page.locator('#shift-brief .shift-item')).toHaveCount(3);
  await expect(page.locator('#shift-brief .shift-item').nth(2)).toHaveAttribute('href','https://fruitszipper.asobisystem.com/live_information/detail/40048');
  expect(await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'))).toBeNull();
  await page.clock.setFixedTime(new Date('2026-11-21T10:05:00+09:00'));
  await page.reload();
  await expect(page.locator('#shift-brief')).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-11-22T00:01:00+09:00'));
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await expect(page.locator('#shift-brief')).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'))).toBeNull();
});


test('Taxi scheduled evidence: source status, age, official links and change tracking are rendered safely',async ({page})=>{
 const now=new Date('2026-11-20T12:00:00+09:00');
 await page.clock.setFixedTime(now);
 await page.route('**/taxi/research-feed.json?ts=*',async route=>{
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     schema:1,generatedAt:'2026-11-20T02:50:00Z',timezone:'Asia/Tokyo',sources:[
       {id:'jma',name:'気象庁｜予報',status:'ok',checkedAt:'2026-11-20T02:50:00Z',
        publishedAt:'2026-11-20T02:00:00Z',url:'https://www.jma.go.jp/bosai/forecast/',
        summary:'くもり',items:[]},
       {id:'naha_rss',name:'那覇市｜公式更新',status:'ok',checkedAt:'2026-11-20T02:50:00Z',
        publishedAt:null,url:'https://www.city.naha.okinawa.jp/about/rss.html',
        summary:'直近の関連見出し1件',items:[{id:'a',title:'交通規制のお知らせ',url:'https://www.city.naha.okinawa.jp/news/test.html'}]},
       {id:'cruise_catalog',name:'沖縄県｜クルーズ台帳',status:'error',checkedAt:'2026-11-20T02:50:00Z',
        publishedAt:null,url:'https://data.bodik.jp/dataset/470007_okinawa-cruise',
        summary:'公式情報を取得できませんでした',items:[]}
     ],difference:{status:'compared',added:[{id:'a'}],previousAt:'2026-11-20T01:50:00Z'}
   })});
 });
 await page.goto('./research.html?phase=during',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#feed-status')).toHaveText('一部未取得');
 await expect(page.locator('#feed-meta')).toContainText('気象庁：取得成功');
 await expect(page.locator('#feed-meta')).toContainText('那覇市：取得成功');
 await expect(page.locator('#feed-meta')).toContainText('沖縄県：未取得');
 const layout=await page.evaluate(()=>({
  first:document.querySelector('#auto-research').getBoundingClientRect().top,
  shift:document.querySelector('#shift-brief').getBoundingClientRect().top,
  weather:document.querySelector('#weather-section').getBoundingClientRect().top,
  badge:document.querySelector('#feed-status').getBoundingClientRect().top,
  viewport:innerHeight,
  bodyWidth:document.documentElement.scrollWidth,
  viewportWidth:innerWidth
 }));
 expect(layout.first).toBeLessThan(layout.shift);
 expect(layout.first).toBeLessThan(layout.weather);
 expect(layout.badge).toBeLessThan(layout.viewport);
 expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
 await expect(page.locator('#feed-sources')).toContainText('くもり');
 await expect(page.locator('#feed-sources')).toContainText('直近の関連見出し1件');
 await expect(page.locator('#feed-sources')).toContainText('未取得');
 await expect(page.locator('#feed-sources')).toContainText('前回の配信との差分');
 await expect(page.locator('#feed-details')).not.toHaveAttribute('open','');
 await page.locator('#feed-details summary').click();
 await expect(page.locator('#feed-details')).toHaveAttribute('open','');
 await expect(page.locator('#feed-sources a[href="https://www.city.naha.okinawa.jp/news/test.html"]')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'))).toBeNull();
});

test('Taxi scheduled evidence: stale snapshot cannot masquerade as current',async ({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-20T12:00:00+09:00'));
 await page.route('**/taxi/research-feed.json?ts=*',async route=>{
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      schema:1,generatedAt:'2026-11-19T05:00:00Z',
      sources:[{id:'jma',name:'気象庁｜予報',status:'ok',checkedAt:'2026-11-19T05:00:00Z',
        publishedAt:'2026-11-19T04:00:00Z',url:'https://www.jma.go.jp/bosai/forecast/',summary:'昔の天気',items:[]}],
      difference:{status:'compared',added:[],previousAt:null}
   })});
 });
 await page.goto('./research.html?phase=before',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#feed-status')).toHaveText('配信が古い');
 await expect(page.locator('#feed-sources')).not.toContainText('昔の天気');
 await expect(page.locator('#feed-sources')).toContainText('更新されていません');
});

test('Taxi scheduled evidence: missing feed fails closed',async ({page})=>{
 await page.route('**/taxi/research-feed.json?ts=*',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.goto('./research.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#feed-status')).toHaveText('未取得');
 await expect(page.locator('#feed-meta')).toContainText('公式原本を直接確認');
});


test('Taxi scheduled evidence: errors never produce a green source health indicator',async ({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-20T12:00:00+09:00'));
 await page.route('**/taxi/research-feed.json?ts=*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   schema:1,generatedAt:'2026-11-20T02:50:00Z',timezone:'Asia/Tokyo',
   sources:[
     {id:'jma',name:'気象庁',status:'error',checkedAt:'2026-11-20T02:50:00Z',
       publishedAt:null,url:'https://www.jma.go.jp/bosai/forecast/',summary:'失敗',items:[]},
     {id:'naha_rss',name:'那覇市',status:'error',checkedAt:'2026-11-20T02:50:00Z',
       publishedAt:null,url:'https://www.city.naha.okinawa.jp/about/rss.html',summary:'失敗',items:[]}
   ],difference:{status:'not_checked',added:[],previousAt:null}
 })}));
 await page.goto('./research.html?phase=during',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#feed-status')).toHaveText('情報源未取得');
 await expect(page.locator('#feed-status')).toHaveClass(/warn/);
 await expect(page.locator('#feed-meta')).toContainText('確認できた公式情報がありません');
 expect(await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'))).toBeNull();
});

test('Taxi scheduled evidence: an open screen expires automatically when the feed passes 150 minutes',async ({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-20T12:00:00+09:00'));
 await page.route('**/taxi/research-feed.json?ts=*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   schema:1,generatedAt:'2026-11-20T02:50:00Z',
   sources:[{id:'jma',name:'気象庁',status:'ok',checkedAt:'2026-11-20T02:50:00Z',
     publishedAt:'2026-11-20T02:00:00Z',url:'https://www.jma.go.jp/bosai/forecast/',summary:'今の予報',items:[]}],
   difference:{status:'not_checked',added:[],previousAt:null}
 })}));
 await page.goto('./research.html?phase=during',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#feed-status')).toHaveText('配信確認');
 await page.clock.setFixedTime(new Date('2026-11-20T14:31:00+09:00'));
 await page.evaluate(()=>window.YOSTaxiResearchTest.revalidateOfficialFeed());
 await expect(page.locator('#feed-status')).toHaveText('配信が古い');
 await expect(page.locator('#feed-sources')).not.toContainText('今の予報');
 await expect(page.locator('#feed-sources')).toContainText('更新されていません');
 expect(await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'))).toBeNull();
});

test('Taxi scheduled evidence: unknown source publication date is not a failed request',async ({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-20T02:22:00+09:00'));
 await page.route('**/taxi/research-feed.json?ts=*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
  schema:1,generatedAt:'2026-11-19T17:18:00Z',
  sources:[
   {id:'jma',name:'気象庁｜本島中南部の予報',status:'ok',checkedAt:'2026-11-19T17:18:00Z',
     publishedAt:'2026-11-19T08:00:00Z',summary:'くもり',url:'https://www.jma.go.jp/bosai/forecast/',items:[]},
   {id:'naha_rss',name:'那覇市｜公式更新',status:'ok',checkedAt:'2026-11-19T17:18:00Z',
     publishedAt:null,summary:'関連する見出しなし',url:'https://www.city.naha.okinawa.jp/about/rss.html',items:[]},
   {id:'cruise_catalog',name:'沖縄県｜クルーズ予約・実績資料',status:'unknown',
     checkedAt:'2026-11-19T17:18:00Z',publishedAt:null,
     summary:'2026年の寄港予約CSV',url:'https://data.bodik.jp/dataset/470007_okinawa-cruise',items:[]}
  ],
  difference:{status:'not_checked',added:[],previousAt:null}
 })}));
 await page.goto('./research.html?phase=before',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#feed-status')).toHaveText('一部要確認');
 await expect(page.locator('#feed-status')).toHaveClass(/warn/);
 await expect(page.locator('#feed-meta')).toContainText('沖縄県：更新日不明');
 await expect(page.locator('#feed-meta')).toContainText('更新日・鮮度を要確認');
 await expect(page.locator('#feed-meta')).not.toContainText('一部の公式情報を取得できませんでした');
 expect(await page.evaluate(()=>localStorage.getItem('yos-taxi-ui-v2-live-20261117'))).toBeNull();
});


test('field report: tap, reload, duplicate guard and one-item undo on simulated iPhone', async ({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-23T20:00:00+09:00'));
  await page.goto('./ui-v2.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#status-btn')).toBeVisible();
  // Use the same real UI route that creates a confirmed local shift, not a mocked API.
  await page.locator('#status-btn').click();
  await page.locator('#modal-actions button.primary').click();
  await page.locator('[data-page="strategy"]').click();
  await expect(page.locator('#strategy-main')).toContainText('未判定');
  await page.locator('#field-open').click();
  await expect(page.locator('#field-layer')).toBeVisible();
  await page.locator('[data-observation="go_none"]').click();
  await expect(page.locator('#field-layer')).toBeHidden();
  await expect(page.locator('#field-summary')).toContainText('GO反応なし');
  const readStored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('yos-taxi-field-reports-v1')));
  expect((await readStored()).entries).toHaveLength(1);
  await page.locator('#field-open').click();
  await page.locator('[data-observation="go_none"]').click();
  expect((await readStored()).entries).toHaveLength(1);
  await page.locator('#field-close').click();
  // Changing the observed fact creates a second event, not a fabricated recommendation.
  await page.locator('#field-open').click();
  await page.locator('[data-observation="queue_still"]').click();
  expect((await readStored()).entries).toHaveLength(2);
  await expect(page.locator('#strategy-main')).toContainText('未判定');
  // Reload must retain local observations, and undo must not cascade to older observations.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-page="strategy"]').click();
  await expect(page.locator('#field-summary')).toContainText('待機列が動かない');
  await page.locator('#field-open').click();
  await page.locator('#field-undo').click();
  const audit=await readStored();
  expect(audit.entries).toHaveLength(2);
  expect(audit.entries[1].voidedAt).toBeTruthy();
  expect(audit.entries[0].voidedAt).toBeUndefined();
  await expect(page.locator('#field-undo')).toBeDisabled();
  await expect(page.locator('#field-last')).toContainText('GO反応なし');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-page="strategy"]').click();
  await page.locator('#field-open').click();
  await expect(page.locator('#field-undo')).toBeDisabled();
  expect((await readStored()).entries).toHaveLength(2);
});

test('field report: narrow viewports keep text and every tap target accessible',async ({page})=>{
  await page.goto('./ui-v2.html',{waitUntil:'domcontentloaded'});
  await page.locator('[data-page="strategy"]').click();
  await page.locator('#field-open').click();
  await expect(page.locator('#field-layer')).toBeVisible();
  for(const width of [320,375,390,402]){
    await page.setViewportSize({width,height:700});
    const layout=await page.evaluate(()=>{
      const sheet=document.querySelector('.field-sheet'),buttons=[...document.querySelectorAll('.field-choice,.field-close,.field-undo')];
      const rect=sheet.getBoundingClientRect();
      return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
        sheet:{left:rect.left,right:rect.right,width:rect.width},
        buttons:buttons.map(el=>({label:el.textContent.trim(),width:el.getBoundingClientRect().width,
          height:el.getBoundingClientRect().height,overflow:el.scrollWidth>el.clientWidth+1}))};
    });
    expect(layout.documentWidth,'horizontal overflow at '+width).toBeLessThanOrEqual(layout.viewport);
    expect(layout.sheet.left,'left clipping at '+width).toBeGreaterThanOrEqual(-1);
    expect(layout.sheet.right,'right clipping at '+width).toBeLessThanOrEqual(layout.viewport+1);
    for(const b of layout.buttons){
      expect(b.width,b.label+' tap width at '+width).toBeGreaterThanOrEqual(44);
      expect(b.height,b.label+' tap height at '+width).toBeGreaterThanOrEqual(44);
      expect(b.overflow,b.label+' text overflow at '+width).toBe(false);
    }
  }
});


test('YOS field consultation requires explicit tap and keeps the recommendation neutral',async ({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-23T20:00:00+09:00'));
  await page.goto('./ui-v2.html',{waitUntil:'domcontentloaded'});
  await page.locator('#status-btn').click();
  await page.locator('#modal-actions button.primary').click();
  await page.locator('[data-page="strategy"]').click();
  await expect(page.locator('#field-yos-send')).toBeHidden();
  await page.evaluate(()=>{
    window.__yosMockCalls=[];
    window.YOS_AI_BASE_URL='https://project-y-yos-ai.vercel.app';
    window.YOS_AUTH={getGoogleIdToken:async()=>'short-lived-only'};
    window.YosAiClient=class{
      async chat(input){window.__yosMockCalls.push(input);return {answer:'地域情報が未確認のため移動を確定できません'};}
    };
  });
  await page.locator('#field-open').click();
  await page.locator('[data-observation="go_none"]').click();
  await expect(page.locator('#field-yos-send')).toBeVisible();
  await expect(page.locator('#field-yos-send')).toHaveText('YOSに現状を送って相談');
  expect(await page.evaluate(()=>window.__yosMockCalls.length)).toBe(0);
  await page.locator('#field-yos-send').click();
  await expect(page.locator('#field-yos-status')).toContainText('参考回答を受信しました');
  await expect(page.locator('#field-yos-answer')).toContainText('地域情報が未確認');
  await expect(page.locator('#strategy-main')).toContainText('未判定');
  expect(await page.evaluate(()=>window.__yosMockCalls.length)).toBe(1);
  const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));
  expect(storage).not.toContain('short-lived-only');
  expect(storage).not.toContain('地域情報が未確認');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-page="strategy"]').click();
  await expect(page.locator('#field-yos-send')).toBeVisible();
  await expect(page.locator('#field-yos-answer')).toBeHidden();
});
