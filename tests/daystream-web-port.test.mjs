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
test('No false Notion or Apple Calendar automatic-sync claims',()=>{
 assert.match(boot,/existingYosCache\|\|importedTasks/);
 assert.match(boot,/taskSource:effectiveTasks\?/);
 assert.match(boot,/calendarCoverage:importedCalendarCoverage/);
 assert.match(boot,/Notion未接続/);
 assert.match(boot,/Appleカレンダー未接続/);
 assert.match(boot,/自動同期なし/);
 assert.doesNotMatch(boot,/NOTION_INTEGRATION_TOKEN|Bearer \$\{/);
 assert.match(html,/YOS_DAYSTREAM_WEB\.logCompletion/);
});
test('Learning remains suggestion only after three observed completions',()=>{
 assert.match(boot,/filter\(a=>a\.length>=3\)/);
 assert.match(boot,/Math\.floor\(sorted\.length\/2\)/);
 assert.match(boot,/時間割を自動変更しません/);
});

test('DAYSTREAM home-screen install resolves to DAYSTREAM instead of MY WAY',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../yos/daystream/manifest.webmanifest',import.meta.url),'utf8'));
 const original=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
 assert.match(html,/<link rel="manifest" href="\.\/manifest\.webmanifest">/);
 assert.equal(manifest.short_name,'DAYSTREAM');
 assert.equal(manifest.name,'YOS DAYSTREAM');
 assert.equal(manifest.id,'./');
 assert.equal(manifest.start_url,'./');
 assert.equal(manifest.scope,'./');
 assert.equal(manifest.display,'standalone');
 assert.equal(original.start_url,'./yos/','original MY WAY launch URL is protected');
 assert.notEqual(manifest.start_url,original.start_url);
 const sw=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
 assert.match(sw,/'\.\/yos\/daystream\/manifest\.webmanifest'/);
});

test('iPhone home-screen layout paints safe-area dark and keeps header crisp',()=>{
 assert.equal((html.match(/<meta name="viewport"/g)||[]).length,1,'exactly one viewport declaration');
 assert.match(html,/<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/);
 assert.match(html,/<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/);
 assert.match(html,/<body class="yos-daystream-web">/);
 assert.match(html,/html\{background:#262c35!important\}/);
 assert.match(html,/body\.yos-daystream-web \.app\{padding-top:18px\}/);
 assert.match(html,/\.yos-web-port\{[^}]*backdrop-filter:none;[^}]*-webkit-backdrop-filter:none;[^}]*opacity:1;/);
 assert.match(html,/\.yos-web-port a,\.yos-web-port button\{[^}]*backdrop-filter:none;[^}]*-webkit-backdrop-filter:none;/);
 const sw=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
 assert.match(sw,/const CACHE_NAME=CACHE_PREFIX\+'v[0-9]+-daystream-/);
});
