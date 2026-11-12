import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../yos/daystream/index.html',import.meta.url),'utf8');
const native=fs.readFileSync(new URL('../ios-app/scriptable/YOS Timeline Charcoal 確認 20261111.js',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const boot=scripts[0],ui=scripts[1];
test('Web port inherits the approved original charcoal UI and main navigation',()=>{
 assert.match(html,/--bg:#353a44/);
 assert.match(html,/id="timelinePanel"/);
 assert.match(html,/id="taskPanel"/);
 assert.match(html,/id="yosLearningHints"/);
 assert.match(native,/YOS_LIFE_LEARNING_LIVE_START/);
 assert.match(html,/YOS_LIFE_LEARNING_LIVE_START/);
});
test('Browser scripts parse without native Scriptable APIs',()=>{
 assert.equal(scripts.length,2);
 for(const code of scripts)new vm.Script(code);
 assert.match(ui,/WEB_PORT_BRIDGE/);
 assert.doesNotMatch(ui,/FileManager\.local\(\)|new WebView\(\)|Keychain\.get/);
});
test('Migration is explicit, bounded and isolated from the native save file',()=>{
 assert.match(boot,/YOS_DAYSTREAM_WEB_PLAN_V1/);
 assert.match(boot,/YOS_DAYSTREAM_WEB_PLAN_BACKUP_V1/);
 assert.match(boot,/confirm\('Web版の現在の時間割を置き換えます/);
 assert.match(boot,/file\.size>1000000/);
 assert.match(boot,/localStorage\.getItem\(KEY\)/);
 assert.match(boot,/localStorage\.getItem\(BACKUP\)/);
 assert.match(html,/元のScriptableファイルは変更されません/);
 assert.doesNotMatch(boot,/YOS_TIMELINE_CHARCOAL_VERIFY_20261111_v1\.json/);
});
test('No false Notion or Apple Calendar connection claims',()=>{
 assert.match(boot,/taskSource:\{status:'unavailable',items:\[\]\}/);
 assert.match(boot,/calendarCoverage:\{from:'',until:'',status:'unavailable'\}/);
 assert.match(html,/Notion\/Appleカレンダー未接続/);
 assert.match(html,/YOS_DAYSTREAM_WEB\.logCompletion/);
});
test('Learning remains suggestion only after three observed completions',()=>{
 assert.match(boot,/filter\(a=>a\.length>=3\)/);
 assert.match(boot,/Math\.floor\(sorted\.length\/2\)/);
 assert.match(boot,/時間割の自動変更はしません/);
});
