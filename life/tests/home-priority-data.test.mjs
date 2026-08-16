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
  activeLifeDate: '2026-08-02',
  moneySafety: { todayBudget: '3000', danger: 'watch' },
  lifeCalendar: [{
    id: 'existing-hospital',
    title: '既存の病院予定',
    category: 'health',
    rule: { type: 'monthly', day: 20 },
    timeLabel: '予約'
  }],
  days: {
    '2026-08-02': {
      tasks: [{ text: '洗濯する', done: false, category: 'personal' }],
      doneToday: '部屋を片づけた',
      lifeFlow: { startedAt: '2026-08-02T01:00:00.000Z', protect: '睡眠' },
      money: { spentToday: '1200' },
      hjSnapshot: { schema: 'life-hj-export-v1', date: '2026-08-02' }
    }
  }
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

localStorage.setItem('yos-life-v1', JSON.stringify({
  days: {
    '2026-08-02': {
      tasks: [{ text: '洗濯する', done: true, category: 'personal' }]
    }
  }
}));

const saved = JSON.parse(localStorage.getItem('yos-life-v1'));
assert.equal(saved.days['2026-08-02'].doneToday, '部屋を片づけた', 'core saves must preserve doneToday');
assert.equal(saved.activeLifeDate, '2026-08-02', 'core saves must preserve the wake-to-sleep day boundary');
assert.equal(saved.moneySafety.todayBudget, '3000', 'core saves must preserve Money safety facts');
assert.equal(saved.days['2026-08-02'].lifeFlow.protect, '睡眠', 'core saves must preserve the daily flow');
assert.equal(saved.days['2026-08-02'].money.spentToday, '1200', 'core saves must preserve the daily amount');
assert.equal(saved.days['2026-08-02'].hjSnapshot.schema, 'life-hj-export-v1', 'core saves must preserve the facts-only snapshot');
assert.equal(saved.lifeCalendar[0].title, '既存の病院予定', 'core saves must preserve the Life calendar source of truth');
assert.match(source, /homeFocusInputV1/, 'home must expose one priority task');
assert.match(source, /homeDoneInputV1/, 'home must expose done-today input');
assert.match(source, /day\.doneToday/, 'doneToday must remain in the existing Life day record');
assert.match(source, /pages\.home\.append\(buildLifeCalendar\(\),buildDailyFlow\(\),week,buildDashboard\(\)\)/, 'Life calendar must lead the compact home');
assert.doesNotMatch(source, /localStorage\.clear\(/, 'daily flow must never clear existing Life data');

console.log('Life home priority data: PASS');
