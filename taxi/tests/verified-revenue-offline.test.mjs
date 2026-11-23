import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sw=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../ui-v2.html',import.meta.url),'utf8');
const moduleSource=readFileSync(new URL('../verified-revenue-v1.js',import.meta.url),'utf8');

test('offline app shell precaches the exact script required by confirmed-photo revenue UI',()=>{
  const staticList=sw.match(/const STATIC=\[([\s\S]*?)\];/)?.[1]||'';
  assert.match(staticList,/'\.\/ui-v2\.html'/);
  assert.match(staticList,/'\.\/verified-revenue-v1\.js'/);
  assert.match(html,/<script src="\.\/verified-revenue-v1\.js"><\/script>/);
  assert.match(moduleSource,/yos-taxi-confirmed-reports-v1/);
});

test('existing fixed PWA v149 cache contract remains isolated from local ledgers',()=>{
  assert.match(sw,/const CACHE_PREFIX='yos-taxi-projecty-';/);
  assert.match(sw,/const VERSION='149';/);
  assert.match(sw,/const CACHE='yos-taxi-projecty-v149-revenue-goal';/);
  assert.doesNotMatch(sw,/\blocalStorage\b|\bindexedDB\b|\bsessionStorage\b/);
  assert.match(sw,/cache\.addAll\(STATIC\)/);
});
