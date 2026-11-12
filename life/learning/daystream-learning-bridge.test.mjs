import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDaystreamLearningSnapshot as prepare} from './daystream-learning-bridge.mjs';
const a='a'.repeat(32),b='b'.repeat(32),c='c'.repeat(32),d='d'.repeat(32);
const source=(items,status='ok')=>({status,checkedAt:'2026-11-12T11:00:00+09:00',items});
const item=(id,title,due,status='次にやる')=>({id,title,due,status});
const now='2026-11-12T12:01:00+09:00';
test('existing Scriptable taskSource produces display-only deadline suggestions',()=>{
 const x=prepare({now,taskSource:source([item(a,'明日が期限','2026-11-13'),item(b,'今日が期限','2026-11-12')])});
 assert.equal(x.status,'read_only');assert.equal(x.complete,true);assert.equal(x.cards.length,2);
 assert.equal(x.cards[0].placement,'in_app_only');assert.equal(x.cards[0].changesOriginal,false);
 assert.equal(x.cards[0].reason.includes('期限時刻は未確認'),true);
});
test('never treat source partial as complete, yet allow safely observed hints',()=>{
 const x=prepare({now,taskSource:source([item(a,'一件だけ','2026-11-12')],'partial')});
 assert.equal(x.complete,false);assert.equal(x.cards.length,1);
 assert.match(x.reason,/未取得タスク/);
});
test('authentication failure, missing snapshot or invalid time never create reminders',()=>{
 for(const input of [undefined,source([], 'unavailable'),source([], 'error'),source([],'bad')])
 assert.deepEqual(prepare({now,taskSource:input}).cards,[]);
 assert.equal(prepare({taskSource:source([item(a,'x','2026-11-12')])}).status,'unavailable');
});
test('ignored states and out-of-window due dates do not become cards',()=>{
 const list=[item(a,'done','2026-11-12','完了'),item(b,'blocked','2026-11-12','待ち'),item(c,'later','2026-11-16'),item(d,'overdue','2026-11-11')];
 assert.equal(prepare({now,taskSource:source(list)}).cards.length,0);
});
test('duplicate identity, invalid ID, title and calendar dates are excluded',()=>{
 const list=[item(a,'valid','2026-11-12'),item(a,'duplicate','2026-11-12'),item('bad','no ID','2026-11-12'),item(b,'','2026-11-12'),item(c,'impossible','2026-11-31')];
 const x=prepare({now,taskSource:source(list)});
 assert.equal(x.cards.length,1);assert.equal(x.cards[0].title,'valid');
});
test('do not mutate existing source, include token or invent a time',()=>{
 const original=source([item(a,'ごみ','2026-11-12')]);const saved=JSON.stringify(original);
 const x=prepare({now,taskSource:original});
 assert.equal(JSON.stringify(original),saved);
 assert.equal(x.cards[0].dueDate,'2026-11-12');
 assert.equal(Object.hasOwn(x.cards[0],'dueAt'),false);
 assert.equal(JSON.stringify(x).includes('Authorization'),false);
});
