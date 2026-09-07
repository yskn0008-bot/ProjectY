import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../task-dashboard.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../task-dashboard.css',import.meta.url),'utf8');
const sw=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');

test('dashboard uses the requested daily groups without embedding current task records',()=>{
  for(const label of ['今やる','次','待ち','保留','完了'])assert.ok(js.includes(label),label);
  assert.doesNotMatch(js,/10,000円返済|マイナンバーカード|CrowdWorks｜既存返信|Tapoハブ/);
  assert.doesNotMatch(js,/1N7Pzs2ObijeiiLABtQR9uZUZf6-bNvBGXdCMnN-i-_c|965c6086-32c1-463d-93b4-87a9cb69b3ad/);
  assert.match(js,/Authorization:`Bearer \$\{token\}`/);
  assert.match(js,/localStorage\.setItem\(CACHE_KEY/);
  assert.doesNotMatch(js,/localStorage\.setItem\([^,]+,\s*credential/);
});

test('authentication starts only from the explicit update action',()=>{
  assert.equal(js.match(/setupAuth\(/g)?.length,2);
  assert.match(js,/addEventListener\('click',\(\)=>\{if\(initialized\).*setupAuth\(true\)/);
});

test('dashboard preserves iPhone-first non-horizontal visual contract',()=>{
  assert.match(css,/overflow-wrap:anywhere/);
  assert.doesNotMatch(css,/overflow-x:\s*auto|white-space:\s*nowrap[^}]*task-copy/);
  assert.match(css,/grid-template-columns:repeat\(3,1fr\)/);
});

test('service worker injects and caches dashboard assets',()=>{
  assert.match(sw,/task-dashboard\.css\?v=1/);
  assert.match(sw,/task-dashboard\.js\?v=1/);
  assert.match(sw,/html\.includes\('task-dashboard\.css'\)/);
  assert.match(sw,/html\.includes\('task-dashboard\.js'\)/);
});
