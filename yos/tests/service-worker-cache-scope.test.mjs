import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const yosRoot = resolve(here, '..');
const source = readFileSync(resolve(yosRoot, 'service-worker.js'), 'utf8');

function readStringConstant(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `${name} must be declared as a string constant`);
  return match[1];
}

const cachePrefix = readStringConstant('CACHE_PREFIX');

test('cache identity is scoped to YOS command center', () => {
  assert.equal(cachePrefix, 'yos-command-center-');
  assert.match(source, /const\s+CACHE\s*=\s*`\$\{CACHE_PREFIX\}v11-visual-pixel-match`/);
  assert.match(source, /['"]\.\/hj-entry\.js['"]/);
  assert.match(source, /['"]\.\/assets\/home-life-path-watercolor-v1\.webp['"]/);
  assert.match(source, /['"]\.\/assets\/journey-valley-watercolor-v1\.webp['"]/);
});

test('activate deletes only old YOS command center cache generations', () => {
  assert.match(source, /key\.startsWith\(CACHE_PREFIX\)\s*&&\s*key\s*!==\s*CACHE/);
  assert.doesNotMatch(source, /keys\.filter\(\(key\) => key !== CACHE\)/);
  assert.doesNotMatch(source, /keys\.map\(\(key\) => caches\.delete\(key\)\)/);
  assert.match(source, /clients\.claim\(\)/);
});

test('activate cleanup does not name or target sibling app caches', () => {
  const activateMatch = source.match(/self\.addEventListener\('activate', \(event\) => \{([\s\S]*?)\n\}\);/);
  assert.ok(activateMatch, 'activate handler must exist');
  const activateBlock = activateMatch[1];

  assert.doesNotMatch(activateBlock, /taxi|life|nav|server/i);
  assert.doesNotMatch(activateBlock, /caches\.delete\((?:'|")/);
});
