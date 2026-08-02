import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const smoke = await readFile(new URL('./iphone-se3-smoke.mjs', import.meta.url), 'utf8');
const theme = await readFile(new URL('../theme-v134.js', import.meta.url), 'utf8');

const themeKeyMatch = theme.match(/const KEY='([^']+)'/);
assert.ok(themeKeyMatch, 'theme storage key not found');
const themeKey = themeKeyMatch[1];

const themeIds = [...theme.matchAll(/\{id:'([^']+)'/g)].map((match) => match[1]);

const pageRoutes = [
  "['drive', '']",
  "['today', 'calendar.html?page=today']",
  "['week', 'calendar.html?page=week']",
  "['month', 'calendar.html?page=month']",
  "['manage', 'calendar.html?page=manage']"
];

test('smoke test uses the production theme storage key', () => {
  const escaped = themeKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(smoke, new RegExp(`const\\s+THEME_KEY\\s*=\\s*['\"]${escaped}['\"]`));
});

test('smoke test covers every production theme', () => {
  assert.deepEqual(themeIds, ['minimal', 'night-gold', 'light', 'map', 'hud']);
  for (const id of themeIds) assert.ok(smoke.includes(`'${id}'`), `missing theme: ${id}`);
  assert.match(smoke, /dataset\.yosTheme/);
});

test('smoke test covers all five Taxi pages', () => {
  for (const route of pageRoutes) assert.ok(smoke.includes(route), `missing route: ${route}`);
});

test('smoke test is fixed to iPhone SE3 dimensions and touch input', () => {
  assert.match(smoke, /viewport:\s*\{\s*width:\s*375,\s*height:\s*667\s*\}/);
  assert.match(smoke, /isMobile:\s*true/);
  assert.match(smoke, /hasTouch:\s*true/);
});

test('smoke test checks overflow, touch targets, page errors and service worker', () => {
  for (const marker of ['horizontal overflow', 'too many small touch targets', 'page errors', 'Service Worker not active']) {
    assert.ok(smoke.includes(marker), marker);
  }
});
