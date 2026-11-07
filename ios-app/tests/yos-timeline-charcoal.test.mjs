import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const source = readFileSync(new URL('../scriptable/YOS Timeline.js', import.meta.url), 'utf8');
const match = source.match(/const html=\x60([\s\S]*?)\x60;\s*await view\.loadHTML\(html\)/);
assert.ok(match, 'auto loader must still locate the current WebView HTML');
const html = match[1].replace(/<\\\/script>/g, '</script>');
const bodyScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

test('approved charcoal template remains compatible with auto-loader', () => {
  assert.match(source, /YOS Timeline v2\.0/);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('id="tl"') && html.includes('id="notice"'));
  assert.ok(html.includes('</html>') && html.length > 2000);
});
test('embedded JavaScript compiles without external libraries', () => {
  assert.ok(bodyScript);
  assert.doesNotThrow(() => new Script(bodyScript));
  assert.doesNotMatch(html, /<script[^>]*src=/i);
});
test('base palette is charcoal, not metallic, gold or old bright white', () => {
  assert.match(html, /--bg:#353a44/);
  assert.match(html, /background:#24976e/);
  assert.match(html, /background:#823db0/);
  assert.match(html, /background:#2e77b3/);
  assert.doesNotMatch(html, /#faf9f7|#8262e9|metallic|golden/i);
});
test('five tabs, date selector, timeline and editing actions exist', () => {
  for (const id of ['dateTitle','weekStrip','datePicker','nowLine','nowBadge','tl','addBtn','editor','saveBtn','editSelected','deleteSelected','taskPanel','review','recordsPanel','aiPanel','focus','searchInput'])
    assert.ok(html.includes('id="'+id+'"'), id+' missing');
  for (const tab of ['timeline','task','analysis','records','ai'])
    assert.ok(html.includes('data-tab="'+tab+'"'),tab+' missing');
  for (const fn of ['renderWeek','showDay','updateNow','renderLists','updateOverview'])
    assert.ok(bodyScript.includes('function '+fn+'('),fn+' missing');
});
test('elapsed-time position and overlap lanes are implemented', () => {
  assert.match(bodyScript,/const scale=56/);
  assert.match(bodyScript,/const yFor=m=>m\/60\*scale/);
  assert.match(bodyScript,/lanes\.set\(item,\{lane,count:0\}\)/);
  assert.match(bodyScript,/el\.classList\.add\('lane'\)/);
});
test('local-only storage respects empty arrays and labels sample data', () => {
  assert.match(bodyScript,/YOS_TIMELINE_LOCAL_V2/);
  assert.match(bodyScript,/Array\.isArray\(stored\)\?stored:initialItems/);
  assert.match(bodyScript,/if\(isSample\)\{items=\[\];isSample=false;\}/);
  assert.match(bodyScript,/keyFor\(selectedDay\)/);
  assert.match(bodyScript,/見本の予定です（実際の予定ではありません）/);
  assert.match(bodyScript,/未記録/);
  assert.match(bodyScript,/AIとの連携は未実装/);
  assert.doesNotMatch(html, /api\.notion\.com|Authorization: Bearer/);
});
test('fixed calendar appointments are protected from destructive changes', () => {
  assert.match(bodyScript,/!item\.f/);
  assert.match(bodyScript,/if\(item\.f\)\{note\.textContent='固定予定は編集できません'/);
  assert.match(bodyScript,/if\(!item\|\|item\.f\)/);
});
