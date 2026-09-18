import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public YOS iPhone entry exposes SSOT dashboard without mock data', async () => {
  const html = await readFile(new URL('../public/yos/index.html', import.meta.url), 'utf8');
  assert.match(html, /本人タスクQueue/);
  assert.match(html, /資産進捗/);
  assert.match(html, /raw\.githubusercontent\.com\/yskn0008-bot\/ProjectY\/main\/data\//);
  assert.match(html, /全体進捗/);
  assert.doesNotMatch(html, /画面遷移確認用|mock/);
});
