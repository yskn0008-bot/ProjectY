'use strict';
// Contract tests: run with node ios-app/tests/remote-power-toggle.test.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const script = fs.readFileSync(path.join(__dirname, '../scriptable/remote-widgets/YOS Remote Power Toggle.js'), 'utf8');

async function run(input, opts = {}) {
  const store = opts.store || new Map();
  const calls = opts.calls || [];
  const choice = opts.choice === undefined ? 0 : opts.choice;
  const light = { nickname: '照明', model: 'light', device_id: 'L', keys: [{ name: 'POWER ON' }, { name: 'POWER OFF' }] };
  const ac = { nickname: 'エアコン', model: 'AC', device_id: 'A' };
  const core = {
    getMap: () => [light, ac],
    findKey: (remote, names) => remote.keys?.find(key => names.includes(key.name)),
    client: async () => ({
      fire: async (id, key) => { if (opts.fail) throw Error('send failed'); calls.push([id, key]); },
      query: async () => opts.acRaw === undefined ? { data: { ac_status: 'P0_M1_T25_S1_D4' } } : opts.acRaw,
      controlAc: async (id, payload) => { if (opts.fail) throw Error('send failed'); calls.push([id, payload]); }
    })
  };
  let output = '';
  const context = {
    args: { shortcutParameter: input },
    Keychain: {
      contains: key => store.has(key),
      get: key => store.get(key),
      set: (key, value) => store.set(key, value),
      remove: key => store.delete(key)
    },
    Alert: class {
      addAction() {}
      addCancelAction() {}
      async presentAlert() { return choice; }
    },
    importModule: () => core,
    Script: { setShortcutOutput: value => { output = value; }, complete() {} }
  };
  await vm.runInNewContext('(async()=>{' + script + '})()', context);
  return { store, calls, output };
}

(async () => {
  let result = await run('light');
  assert.deepEqual(result.calls, [['L', 'POWER ON']]);
  assert.match(result.output, /実機状態は未確認/);
  result = await run('light', { store: result.store, calls: result.calls });
  assert.equal(result.calls[1][1], 'POWER OFF');

  await assert.rejects(run('light', { store: result.store, fail: true }), /send failed/);
  assert.equal(JSON.parse(result.store.get('yos.remote.power-toggle.v1.light')).on, false);

  result = await run('ac', { acRaw: { result: { ac_status: 'P1_M1_T25_S1_D4' } } });
  assert.equal(result.calls[0][1].on, false);
  assert.equal(result.calls[0][1].mode, 1);
  assert.equal(result.calls[0][1].temp, 25);

  result = await run('ac', { acRaw: { result: { ac_status: 'P0_M4_T26_S0_D5' } } });
  assert.equal(result.calls[0][1].on, true);
  assert.equal(result.calls[0][1].mode, 4);

  result = await run('light reset', { store: result.store });
  assert.match(result.output, /リセット/);
  result = await run('light', { choice: 1 });
  assert.equal(result.calls[0][1], 'POWER OFF');
  await assert.rejects(run('ac', { acRaw: {}, choice: -1 }), /キャンセル/);

  process.stdout.write('PASS remote power toggle: first-run, flip, failure, AC profile, reset, cancel\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
