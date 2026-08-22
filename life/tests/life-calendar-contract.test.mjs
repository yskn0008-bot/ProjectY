import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../home-v1.js', import.meta.url), 'utf8');

class FakeStorage {
  constructor(){ this.values = new Map(); }
  getItem(key){ return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key,value){ this.values.set(key,String(value)); }
  removeItem(key){ this.values.delete(key); }
}

const localStorage = new FakeStorage();
localStorage.setItem('yos-life-v1', JSON.stringify({
  days: { '2026-08-16': { tasks: [{ text: '既存タスク', done: false }] } },
  activeGroup: 'wake'
}));

const context = {
  console,
  Date,
  Intl,
  JSON,
  Object,
  Storage: FakeStorage,
  localStorage,
  window: {},
  document: {},
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  requestAnimationFrame: () => {},
  Event: class Event {}
};

vm.runInNewContext(source, context, { filename: 'life/home-v1.js' });

const saved = JSON.parse(localStorage.getItem('yos-life-v1'));
const api = context.window.__yosLifeCalendarV1;
assert.ok(api, 'Life calendar test API must be available');
assert.equal(saved.days['2026-08-16'].tasks[0].text, '既存タスク', 'seeding must preserve existing Life data');
assert.equal(saved.lifeCalendar.length, 12, 'the known recurring schedules must have one source of truth');

const items = date => api.itemsForDate(saved,date);
const titles = date => Array.from(items(date), item => item.title);

assert.deepEqual(titles('2026-08-17'), ['缶・ビン・紙・有害ゴミ'], 'Monday resource garbage is missing');
assert.deepEqual(titles('2026-08-18'), ['燃やすゴミ'], 'Tuesday burnable garbage is missing');
assert.ok(titles('2026-08-12').includes('燃やさないゴミ'), 'second Wednesday non-burnable garbage is missing');
assert.equal(titles('2026-08-19').includes('燃やさないゴミ'), false, 'third Wednesday must not be inferred as a garbage day');
assert.ok(titles('2026-08-22').includes('ペットボトル'), 'fourth Saturday PET bottles are missing');
assert.deepEqual(titles('2026-08-26').filter(title => ['電気','車保険'].includes(title)), ['電気','車保険'], 'same-day payments must both remain visible');
assert.ok(titles('2026-09-27').includes('水道'), 'September water payment is missing');
assert.equal(titles('2026-10-27').includes('水道'), false, 'water payment must stay on its two-month cadence');
assert.ok(titles('2026-11-27').includes('水道'), 'November water payment is missing');
assert.ok(titles('2026-10-10').includes('タクシー給与'), 'taxi salary must stay on the stated 10th');
assert.equal(titles('2026-10-10').includes('家賃収入'), false, 'Saturday rent income must move to the next weekday');
assert.ok(titles('2026-10-12').includes('家賃収入'), 'rent income weekend rollover is missing');
assert.equal(items('2026-08-26').some(item => Object.hasOwn(item,'amount')), false, 'amounts must not be inferred');
assert.equal(source.includes('支払い済み:true'), false, 'payment completion must not be inferred');
assert.doesNotMatch(source, /localStorage\.setItem\(['"]yos-life-calendar/, 'a second calendar storage key must not be created');

const mondayGarbage = items('2026-08-17')[0];
assert.deepEqual(
  {...api.displayFor(mondayGarbage,new Date('2026-08-16T22:59:00Z'))},
  {past:false,label:'朝8時まで'},
  'a deadline must remain upcoming at 07:59 JST'
);
assert.deepEqual(
  {...api.displayFor(mondayGarbage,new Date('2026-08-16T23:01:00Z'))},
  {past:true,label:'朝8時を過ぎました'},
  'an elapsed garbage deadline must not look actionable'
);
const electricity = items('2026-08-26').find(item => item.title === '電気');
assert.deepEqual(
  {...api.displayFor(electricity,new Date('2026-08-26T14:59:00Z'))},
  {past:false,label:'支払日'},
  'a payment without a confirmed time must not be marked elapsed'
);

console.log('Life calendar contract: PASS');
