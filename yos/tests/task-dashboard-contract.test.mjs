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

test('authentication uses an explicit Google-rendered control instead of prompt-only auth',()=>{
  assert.match(js,/googleId\.renderButton\(/);
  assert.doesNotMatch(js,/\.prompt\(/);
  assert.match(js,/taskDashboardGoogleButton/);
  assert.match(js,/itp_support:true/);
});

test('authentication bootstrap is restricted to the production MY WAY origin',()=>{
  assert.match(js,/AUTH_ORIGIN='https:\/\/yskn0008-bot\.github\.io'/);
  assert.match(js,/location\.origin===AUTH_ORIGIN/);
  assert.match(js,/if\(!canPrepareAuth\(\)\|\|initialized\)return/);
});

test('dashboard preserves iPhone-first non-horizontal visual contract',()=>{
  assert.match(css,/overflow-wrap:anywhere/);
  assert.doesNotMatch(css,/overflow-x:\s*auto|white-space:\s*nowrap[^}]*task-copy/);
  assert.match(css,/grid-template-columns:repeat\(3,1fr\)/);
  assert.match(css,/task-google-button/);
});

test('service worker injects and caches dashboard assets',()=>{
  assert.match(sw,/task-dashboard\.css\?v=1/);
  assert.match(sw,/task-dashboard\.js\?v=1/);
  assert.match(sw,/html\.includes\('task-dashboard\.css'\)/);
  assert.match(sw,/html\.includes\('task-dashboard\.js'\)/);
});
