import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDaystreamLearningSection as build} from './daystream-learning-section.mjs';
const now='2026-11-12T11:30:00+09:00';
const id='a'.repeat(32);
const taskSource={status:'ok',checkedAt:'2026-11-12T11:00:00+09:00',items:[{id,title:'可燃ごみ & <script>alert(1)</script>',status:'次にやる',due:'2026-11-13'}]};
test('existing DAYSTREAM Notion source passes end-to-end to safe bounded preview',()=>{
  const original=JSON.stringify(taskSource),out=build({taskSource,now});
  assert.equal(out.status,'read_only');assert.equal(out.complete,true);assert.equal(out.installed,false);
  assert.equal(out.cards.length,1);assert.match(out.html,/明日|時刻未確認/);
  assert.match(out.html,/&lt;script&gt;/);assert.doesNotMatch(out.html,/<script>/);
  assert.equal(JSON.stringify(taskSource),original);
  assert.equal(out.cards[0].dueDate,'2026-11-13');
  assert.equal(Object.hasOwn(out.cards[0],'dueAt'),false);
});
test('missing or failed auth source creates empty content and does not claim installation',()=>{
  for(const input of [null,{status:'unavailable',items:[]},{status:'error',items:[]}]){
    const out=build({now,taskSource:input});
    assert.equal(out.html,'');assert.deepEqual(out.cards,[]);assert.equal(out.installed,false);
  }
});
test('partial source is correctly marked and does not suppress unknown tasks',()=>{
  const out=build({now,taskSource:{...taskSource,status:'partial'}});
  assert.equal(out.complete,false);assert.match(out.html,/一部取得/);
});
test('validated readonly output has no controls, outgoing actions, or keys',()=>{
  const out=build({now,taskSource});
  assert.doesNotMatch(out.html,/<button|<a\s|onclick=|shortcuts:\/\//i);
  assert.equal('token' in out,false);assert.ok(out.css.includes('yos-learning-preview'));
});
