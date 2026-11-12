import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const page=readFileSync(new URL('../notification-history.html', import.meta.url),'utf8');
const inline=[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean);
test('notification-history HTML has valid inline JS',()=>{
  assert.ok(inline.length>0);
  for(const src of inline)new Script(src,{filename:'notification-history.html'});
});
test('authenticated live reads never embed user records or credentials',()=>{
  assert.match(page,/\.\/hj\/yos-auth\.js/);
  assert.match(page,/Authorization:'Bearer '\+token/);
  assert.match(page,/cache:'no-store'/);
  assert.doesNotMatch(page,/google-cloud-run|\.run\.app/);
  assert.match(page,/certified_routes\.includes\('notification'\)/);
  assert.doesNotMatch(page,/notification:b39d57ed|西村陽介|YOS-TEST-P1-20261112/);
  assert.match(page,/未取得です。0件と断定できません/);
});
test('cursor guard, readback and no falsely verified payment completion',()=>{
  assert.match(page,/cursors\.has\(data\.nextCursor\)/);
  assert.match(page,/verify\.event\?\.status!=='pending'/);
  assert.match(page,/支払い・解決・タスク完了としては記録しません/);
  assert.match(page,/既存Inboxで「対応待ち」にします/);
});
test('dense UI contains list/search/filter/detail controls',()=>{
  for(const id of ['events','search','connect','refresh','detail','later','reported','openSource'])assert.match(page,new RegExp('id="'+id+'"'));
  assert.match(page,/grid-template-columns:40px minmax\(0,1fr\) 72px 73px/);
  assert.match(page,/notice-icon/);
  assert.match(page,/b\.classList\.add\('flag'\)/);
  assert.match(page,/YOS_ALERT/);
  assert.match(page,/YOS_SILENT/);
});

test('confirmed empty inbox displays zero counts, not the unverified dash',()=>{
  assert.match(page,/lastComplete\|\|rows\.length\?counts\.action:'—'/);
  assert.match(page,/lastComplete\?'通知履歴はありません'/);
});
