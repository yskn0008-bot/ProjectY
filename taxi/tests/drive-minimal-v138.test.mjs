import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../drive-minimal-v138.js',import.meta.url),'utf8');

test('drive所有ノードだけを更新しquickの拡張DOMを保持するcontract',()=>{
  assert.doesNotMatch(source,/bar\.innerHTML\s*=/);
  assert.match(source,/data-drive-field/);
  assert.match(source,/bar\.appendChild\(field\)/);
  assert.match(source,/if\(small\.textContent!==label\)small\.textContent=label/);
  assert.match(source,/if\(strong\.textContent!==value\)strong\.textContent=value/);
});

test('Observer、更新経路、保存キーのcontractを維持する',()=>{
  assert.match(source,/new MutationObserver\(render\)/);
  assert.match(source,/\.observe\(document\.documentElement,\{childList:true,subtree:true\}\)/);
  assert.match(source,/setInterval\(render,30000\)/);
  assert.match(source,/window\.addEventListener\('storage',render\)/);
  assert.match(source,/yos-taxi-settings-v2/);
  assert.match(source,/yos-taxi-ops-v1/);
});
