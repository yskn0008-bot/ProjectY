import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const file = name => readFileSync(new URL('../'+name, import.meta.url), 'utf8');
const index = file('index.html');
const sw = file('service-worker.js');
const v2 = file('ui-v2.html');
const match = index.match(/<script id="yos-taxi-ui-cutover">([\s\S]*?)<\/script>/);
const router = match?.[1];
const dateKey = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now() - 8*60*60*1000));

function runRouter(record=null, search='') {
  assert.ok(router,'cutover script exists');
  let destination=null;
  const raw=record===null?null:typeof record==='string'?record:JSON.stringify(record);
  const storage={getItem(key){assert.equal(key,'yos-taxi-ops-v1');return raw;}};
  runInNewContext(router,{
    location:{search,href:'https://example.test/ProjectY/taxi/index.html'+search,replace(url){destination=url}},
    localStorage:storage,URL,URLSearchParams,Date,Intl
  });
  return destination;
}

test('new UI is the default on index while the original HTML stays intact',()=>{
  assert.equal(runRouter(), 'https://example.test/ProjectY/taxi/ui-v2.html');
  assert.match(index,/id="dropoffButton"/);
  assert.match(index,/id="backupButton"/);
});

test('legacy opt-in bypasses redirect',()=>{
  assert.equal(runRouter(null,'?legacy=1'),null);
});

for(const status of ['available','occupied','break']) {
  test('do not switch while original shift is active: '+status,()=>{
    assert.equal(runRouter({status,businessDate:dateKey}),null);
  });
}

test('stale or ended shift does not block switching',()=>{
  assert.match(runRouter({status:'occupied',businessDate:'2026-06-01'}),/ui-v2\.html$/);
  assert.match(runRouter({status:'ended',businessDate:dateKey}),/ui-v2\.html$/);
});

test('legacy saved contents remain unmodified and can be reopened',()=>{
  const raw='not-json-legacy-should-not-be-deleted';
  assert.match(runRouter(raw),/ui-v2\.html$/);
  assert.match(v2,/index\.html\?legacy=1/);
  assert.match(v2,/yos-taxi-ui-v2-live-20261117/);
  assert.doesNotMatch(v2,/localStorage\.removeItem\(['"]yos-taxi-ops-v1/);
});

test('PWA caches new UI without changing older fixed version contract',()=>{
  assert.match(sw,/const VERSION='149';/);
  assert.match(sw,/v149-revenue-goal/);
  assert.match(sw,/'\.\/ui-v2\.html'/);
});

test('future OCR and Notion sync are not falsely described as implemented',()=>{
  assert.match(v2,/Notion未接続/);
  assert.match(v2,/画像は現在未送信・未保存/);
  assert.match(v2,/未照合/);
});
