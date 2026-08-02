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
  days: {
    '2026-08-02': {
      tasks: [{ text: '洗濯する', done: false, category: 'personal' }],
      doneToday: '部屋を片づけた'
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
assert.match(source, /homeFocusInputV1/, 'home must expose one priority task');
assert.match(source, /homeDoneInputV1/, 'home must expose done-today input');
assert.match(source, /day\.doneToday/, 'doneToday must remain in the existing Life day record');
assert.match(source, /pages\.home\.append\(week,buildDashboard\(\)\)/, 'home must stay compact by moving the large sunrise card');

console.log('Life home priority data: PASS');
