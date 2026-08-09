import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const finalApp = await readFile(new URL('../final-app-v131.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');

function declaration(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} declaration`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`${name} closing brace`);
}

const context = vm.createContext({ Date });
vm.runInContext(`${declaration('plannedStartDate')}\n${declaration('shiftStartState')}`, context);
const stateAt = (status, businessDate, plannedStart, current) =>
  vm.runInContext(`shiftStartState(${JSON.stringify(status)},${JSON.stringify(businessDate)},${JSON.stringify(plannedStart)},new Date(${JSON.stringify(current)}))`, context);

test('開始1秒前は不可で開始時刻ちょうどから可能', () => {
  assert.equal(stateAt('before', '2026-08-09', '18:46', '2026-08-09T18:45:59').eligible, false);
  const exact = stateAt('before', '2026-08-09', '18:46', '2026-08-09T18:46:00');
  assert.equal(exact.eligible, true);
  assert.equal(exact.hint, '営業開始できます');
});

test('08:00未満のplannedStartはbusinessDate翌暦日', () => {
  const early = stateAt('before', '2026-08-09', '00:00', '2026-08-09T23:59:59');
  assert.equal(early.eligible, false);
  assert.equal(new Date(early.plannedAt).getDate(), 10);
  assert.equal(stateAt('before', '2026-08-09', '00:00', '2026-08-10T00:00:00').eligible, true);
  assert.equal(stateAt('before', '2026-08-31', '03:30', '2026-09-01T03:30:00').eligible, true);
});

test('status gateはbefore以外を常に拒否', () => {
  for (const status of ['available', 'occupied', 'break', 'ended']) {
    assert.equal(stateAt(status, '2026-08-09', '18:46', '2026-08-10T18:46:00').eligible, false);
  }
});

test('元handlerは副作用より先にgateを確認', () => {
  const handler = html.match(/\$\('shiftButton'\)\.onclick=\(\)=>\{([^\n]+)\};/)?.[1] || '';
  const gate = handler.indexOf('shiftStartState(');
  assert.ok(gate >= 0);
  for (const operation of ['confirm(', 'state.shiftStart=', "add('営業開始'", 'save()']) {
    assert.ok(handler.indexOf(operation) > gate, `${operation} must follow gate`);
  }
});

test('visible proxyは生成・同期され、disabled時に転送しない', () => {
  assert.match(html, /<link rel="stylesheet" href="\.\/final-app-v131\.css">/);
  assert.match(html, /<link rel="stylesheet" href="\.\/final-fix-v133\.css">/);
  assert.match(html, /<script defer src="\.\/final-app-v131\.js"><\/script>/);
  assert.match(finalApp, /if\(source&&!button&&pageType\(\)==='drive'\)/);
  assert.match(finalApp, /button\.disabled=source\.disabled/);
  assert.match(finalApp, /if\(!source\|\|source\.disabled\)return;source\.click\(\)/);
  assert.match(finalApp, /if\(button\.disabled\)return;proxy/);
  assert.match(finalApp, /yos:shift-gate-updated/);
});

test('初回navigationでもfinal UI assetsをindex.htmlから直接読み込む', () => {
  assert.match(html, /final-app-v131\.css/);
  assert.match(html, /final-app-v131\.js/);
});

test('保存キーとTaxi Service Worker境界を変更しない', () => {
  assert.match(html, /STORE='yos-taxi-ops-v1',SETTINGS='yos-taxi-settings-v2'/);
  assert.doesNotMatch(html + finalApp, /migration|removeItem\(|localStorage\.clear\(/i);
  assert.match(sw, /const CACHE_PREFIX='yos-taxi-projecty-'/);
  assert.match(sw, /key\.startsWith\(CACHE_PREFIX\)&&key!==CACHE/);
  assert.match(sw, /const VERSION='148'/);
});
