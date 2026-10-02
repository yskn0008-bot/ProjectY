import test from 'node:test';
import assert from 'node:assert/strict';
import {moneyShadowToMirrorInput} from '../dist/intake/money-mirror.js';

test('Money shortage becomes one stable本人操作 mirror row',()=>{
  const input=moneyShadowToMirrorInput({
    updated_at:'2026-10-03T00:30:00+09:00',
    balance:1453,
    today_usable:0,
    next_payment:{date:'2026-10-10',label:'返済',amount:30000},
    next_income:{date:'2026-10-13',label:'家賃収入',amount:160485},
    shortage_possible:true,
    shortfall:28547
  });
  assert.equal(input.items.length,1);
  const item=input.items[0];
  assert.equal(item.syncKey,'money:current');
  assert.equal(item.title,'Money 現在地');
  assert.equal(item.area,'Money');
  assert.equal(item.priority,'P0');
  assert.equal(item.status,'本人操作');
  assert.equal(item.owner,'陽介');
  assert.equal(item.dueAt,'2026-10-10');
  assert.match(item.nextAction,/次の支払い：10\/10 返済 30,000円/u);
  assert.match(item.nextAction,/次の入金：10\/13 家賃収入 160,485円/u);
  assert.equal(item.blocker,'不足見込み：28,547円');
});

test('Money safe state stays out of 今やる by using 保留',()=>{
  const input=moneyShadowToMirrorInput({
    updated_at:'2026-10-03T00:31:00+09:00',
    balance:200000,
    today_usable:5000,
    next_payment:{date:'2026-10-10',label:'返済',amount:30000},
    shortage_possible:false,
    shortage_after_next_payment:false
  });
  const item=input.items[0];
  assert.equal(item.priority,'P2');
  assert.equal(item.status,'保留');
  assert.equal(item.owner,'YOS');
  assert.equal(item.blocker,null);
  assert.match(item.nextAction,/今日使える：5,000円/u);
});

test('Money privacy mode does not expose amounts in Notion text',()=>{
  const input=moneyShadowToMirrorInput({
    updated_at:'2026-10-03T00:32:00+09:00',
    privacy:true,
    balance:1453,
    today_usable:0,
    next_payment:{date:'2026-10-10',label:'返済',amount:30000},
    next_income:{date:'2026-10-13',label:'家賃収入',amount:160485},
    shortage_possible:true,
    shortfall:28547
  });
  const item=input.items[0];
  assert.doesNotMatch(item.nextAction,/30,000|160,485|1,453|0円/u);
  assert.equal(item.blocker,'資金不足の可能性あり');
  assert.match(item.nextAction,/返済/u);
  assert.match(item.nextAction,/家賃収入/u);
});

test('Money event id remains valid when ISO timestamp has timezone plus sign',()=>{
  const input=moneyShadowToMirrorInput({updated_at:'2026-10-03T00:33:00+09:00'});
  assert.match(input.eventId,/^money-shadow:[A-Za-z0-9._:/-]+$/u);
});
