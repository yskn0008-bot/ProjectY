import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('existing YOS shell supports GitHub Pages as iPhone public entry', async () => {
  const dashboard = await readFile(new URL('../shell/yos-dashboard.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../shell/index.html', import.meta.url), 'utf8');
  assert.match(index, /本人タスクQueue/);
  assert.match(index, /資産進捗/);
  assert.match(dashboard, /location\.hostname\.endsWith\('github\.io'\)/);
  assert.match(dashboard, /\.\.\/\.\.\/data\/\$\{filename\}/);
  assert.match(dashboard, /\.\.\/\.\.\/life\//);
  assert.match(dashboard, /\.\.\/\.\.\/taxi\//);
});
