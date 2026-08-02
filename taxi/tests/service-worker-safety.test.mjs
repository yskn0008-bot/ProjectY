import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const taxiRoot = resolve(here, '..');
const swPath = resolve(taxiRoot, 'service-worker.js');
const source = readFileSync(swPath, 'utf8');

function readStringConstant(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `${name} must be declared as a string constant`);
  return match[1];
}

function readStaticAssets() {
  const match = source.match(/const\s+STATIC\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(match, 'STATIC manifest must exist');
  return vm.runInNewContext(`[${match[1]}]`, Object.create(null));
}

const cachePrefix = readStringConstant('CACHE_PREFIX');
const cacheName = readStringConstant('CACHE');
const version = readStringConstant('VERSION');
const staticAssets = readStaticAssets();

test('cache identity is Taxi-scoped and version-synchronised', () => {
  assert.equal(cachePrefix, 'yos-taxi-projecty-');
  assert.ok(cacheName.startsWith(cachePrefix));
  assert.match(cacheName, new RegExp(`v${version}(?:-|$)`));
});

test('STATIC manifest contains only unique safe Taxi-relative paths', () => {
  assert.ok(staticAssets.length > 0);
  assert.equal(new Set(staticAssets).size, staticAssets.length, 'STATIC must not contain duplicates');

  for (const asset of staticAssets) {
    assert.equal(typeof asset, 'string');
    assert.ok(asset === './' || asset.startsWith('./'), `${asset} must remain inside /taxi/`);
    assert.ok(!asset.includes('..'), `${asset} must not escape /taxi/`);
    assert.ok(!asset.startsWith('/'), `${asset} must not be origin-root absolute`);
  }
});

test('every listed static asset exists in /taxi/', () => {
  for (const asset of staticAssets) {
    if (asset === './') continue;
    const diskPath = resolve(taxiRoot, asset.slice(2));
    assert.ok(existsSync(diskPath), `missing STATIC asset: ${asset}`);
  }
});

test('all injected local assets are included in STATIC', () => {
  const injected = [
    ...source.matchAll(/addCss\(['\"]([^'\"]+)['\"]\)/g),
    ...source.matchAll(/addJs\(['\"]([^'\"]+)['\"]\)/g),
  ].map((match) => `./${match[1]}`);

  assert.ok(injected.length > 0, 'inject() must declare local assets');
  for (const asset of injected) {
    assert.ok(staticAssets.includes(asset), `${asset} is injected but absent from STATIC`);
  }
});

test('required Taxi pages are precached and mapped', () => {
  for (const page of ['./index.html', './calendar.html', './settings.html']) {
    assert.ok(staticAssets.includes(page), `${page} must be precached`);
  }
  assert.match(source, /endsWith\(['\"]\/taxi\/index\.html['\"]\)/);
  assert.match(source, /endsWith\(['\"]\/taxi\/calendar\.html['\"]\)/);
  assert.match(source, /endsWith\(['\"]\/taxi\/settings\.html['\"]\)/);
});

test('activate deletes only old Taxi cache generations', () => {
  assert.match(source, /key\.startsWith\(CACHE_PREFIX\)\s*&&\s*key\s*!==\s*CACHE/);
  assert.doesNotMatch(source, /keys\.map\(\s*key\s*=>\s*caches\.delete\(key\)\s*\)/);
  assert.match(source, /clients\.claim\(\)/);
});

test('navigation HTML uses network-first with cached fallback', () => {
  assert.match(source, /fetch\(event\.request,\{cache:['\"]no-store['\"]\}\)/);
  assert.match(source, /caches\.match\(event\.request\)/);
  assert.match(source, /calendar\.html/);
  assert.match(source, /settings\.html/);
  assert.match(source, /index\.html/);
});
