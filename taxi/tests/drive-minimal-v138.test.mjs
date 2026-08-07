import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../drive-minimal-v138.js',import.meta.url),'utf8');

test('renderは同一HTMLを書き換えずMutationObserverの自己再帰を防ぐ',()=>{
  assert.match(source,/const nextHtml=`[\s\S]+`;/);
  assert.match(source,/if\s*\(bar\.innerHTML\s*!==\s*nextHtml\)\s*bar\.innerHTML\s*=\s*nextHtml\s*;/);
  assert.doesNotMatch(source,/(?<![=!])bar\.innerHTML\s*=\s*`/);
});

test('MutationObserver、30秒interval、storage更新を維持する',()=>{
  assert.match(source,/new MutationObserver\(render\)/);
  assert.match(source,/\.observe\(document\.documentElement,\{childList:true,subtree:true\}\)/);
  assert.match(source,/setInterval\(render,30000\)/);
  assert.match(source,/window\.addEventListener\('storage',render\)/);
});
