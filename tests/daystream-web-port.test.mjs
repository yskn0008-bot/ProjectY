import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../yos/daystream/index.html',import.meta.url),'utf8');
const native=fs.readFileSync(new URL('../ios-app/scriptable/YOS Timeline Charcoal 確認 20261111.js',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const boot=scripts[0],ui=scripts[1];
test('Web port uses the DAYSTREAM light appearance and existing navigation',()=>{
 assert.match(html,/--bg:#f4f8fd/);
 assert.match(html,/id="timelinePanel"/);
 assert.match(html,/id="taskPanel"/);
 assert.match(html,/id="yosLearningHints"/);
 assert.match(native,/YOS_LIFE_LEARNING_LIVE_START/);
 assert.match(html,/YOS_LIFE_LEARNING_LIVE_START/);
});
test('Move confirmation uses the existing undo/redo and browser plan',()=>{
 assert.match(html,/id="yosUndoBtn"/);
 assert.match(html,/id="yosRedoBtn"/);
 assert.match(html,/function yosHistoryRestore\(direction\)/);
 assert.match(html,/yosHistorySnapshot\(\)/);
 assert.match(html,/<dialog id="moveDialog"/);
 assert.match(html,/if\(mode==='tap'\)showFocusFor\(item\)/);
 assert.match(html,/if\(next!==item.s\)openMoveDialog/);
 assert.match(html,/if\(!saved\)item.s=original/);
 assert.doesNotMatch(html,/addEventListener\('scroll',restoreScroll/);
});

test('Layer preserves real long intervals and reuses lanes for disjoint windows',()=>{
 const code=ui.slice(ui.indexOf('function yosBackdropRows'),ui.indexOf('function yosReadableAxis'));
 const layout=vm.runInNewContext(code+'\nyosBackdropRows',{});
 const rows=[
  {id:1,s:30,d:450,kind:'schedule',f:true},
  {id:2,s:260,d:30,kind:'task'},
  {id:3,s:390,d:120,kind:'task'},
  {id:4,s:480,d:120,kind:'habit'},
  {id:5,s:610,d:120,kind:'task'},
  {id:6,s:740,d:119,kind:'task'}
 ];
 const input=JSON.stringify(rows),lanes=layout(rows);
 assert.deepEqual(rows.map(row=>lanes.has(row)?[lanes.get(row).lane,lanes.get(row).count]:null),
  [[0,2],null,[1,2],[0,2],[0,1],null]);
 assert.equal(JSON.stringify(rows),input);
 assert.match(ui,/backdrop\?Math\.max\(1,span-2\)/);
 assert.match(ui,/tick\.style\.top=\(natural-3\)/);
 assert.match(html,/\.timeline \.yos-foreground\{z-index:3\}/);
 assert.match(html,/background:var\(--zone-surface\);border-color:var\(--zone-edge\);box-shadow:none/);
 assert.match(html,/task-drag-grip\{flex-basis:38px;min-width:38px/);
});
test('Layer uses the strongest state color and reason, with a visible label',()=>{
 const code=ui.slice(ui.indexOf('const yosCompatRank'),ui.indexOf('function yosOverlapWindows'));
 const compat=vm.runInNewContext(code+'\nyosCompatibility',{});
 const row=(id,t,s,d,kind='task')=>({id,t,s,d,kind});
 const results=compat([
  row(1,'外出準備',10,20),row(2,'外出',30,30),row(3,'予定',40,10,'schedule'),
  row(4,'運動',120,35),row(5,'入浴',160,30,'habit'),
  row(6,'読書',250,20),row(7,'掃除',272,20,'habit'),row(8,'自由時間',400,30)
 ]);
 assert.equal(results.get(2).level,'danger');
 assert.match(results.get(2).reasons[0],/時間重複（10分）/);
 assert.equal(results.get(4).level,'positive');
 assert.equal(results.get(6).level,'negative');
 assert.equal(results.get(8).level,'unknown');
 for(const [state,shade] of [['positive','#dff5ec'],['negative','#fff0da'],['danger','#fce5eb']]){
  assert.ok(html.includes('.timeline .card.compat-'+state+'{--layer-surface:'+shade));
 }
 assert.match(ui,/positive:'＋ 相乗候補',negative:'− 注意',danger:'！ 時間衝突'/);
});
test('Meal advice uses the planned sleep time and preserves an unknown meal size',()=>{
 const code=ui.slice(ui.indexOf('const yosCompatRank'),ui.indexOf('function yosDayCompatibility'));
 const compat=vm.runInNewContext(code+'\nyosCompatibility',{});
 const sleep={id:2,t:'就寝',s:0,d:90,kind:'schedule',f:1};
 const food={id:1,t:'夕食（量が多い）',s:1370,d:40,kind:'task'};
 const context={following:[sleep]};
 const candidate=compat([food],context).get(1);
 assert.equal(candidate.level,'negative');
 assert.match(candidate.reasons[0],/30分/);
 assert.equal(compat([{...food,t:'夕食'}],context).get(1).level,'unknown');
 assert.match(compat([{...food,t:'夕食'}],context).get(1).reasons[0],/食事量が不明/);
 assert.equal(compat([{...food,t:'夕食（軽食）'}],context).get(1).reasons.length,0);
 assert.equal(compat([{...food,s:1200}],context).get(1).reasons.length,0);
 const daytime=compat([{...food,s:360},{...sleep,s:420}]);
 assert.equal(daytime.get(2).level,'negative');
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

test('iPhone home-screen layout paints the safe area light and keeps header crisp',()=>{
 assert.equal((html.match(/<meta name="viewport"/g)||[]).length,1,'exactly one viewport declaration');
 assert.match(html,/<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/);
 assert.match(html,/<meta name="apple-mobile-web-app-status-bar-style" content="default">/);
 assert.match(html,/<body class="yos-daystream-web">/);
 assert.match(html,/html\{background:#f4f8fd!important/);
 assert.match(html,/body\.yos-daystream-web \.app\{padding-top:18px\}/);
 assert.match(html,/\.yos-web-port\{[^}]*backdrop-filter:none;[^}]*-webkit-backdrop-filter:none;[^}]*opacity:1;/);
 assert.match(html,/\.yos-web-port a,\.yos-web-port button\{[^}]*backdrop-filter:none;[^}]*-webkit-backdrop-filter:none;/);
 const sw=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
 assert.match(sw,/const CACHE_NAME=CACHE_PREFIX\+'v[0-9]+-daystream-/);
});


test('unified calendar PWA updates old SW cache and retains offline fallback without exposing private data',()=>{
 const sw=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
 assert.match(sw,/v48-daystream-calendar-domain-pages/);
 for(const path of [
   './life/calendar/','./life/calendar/index.html',
   './life/calendar/native-bridge.js','./life/calendar/unified-sources.js'
 ])assert.ok(sw.includes("'"+path+"'"),'calendar asset is precached: '+path);
 assert.match(sw,/endsWith\('\/life\/calendar\/'\)/);
 for(const path of ['/ProjectY/life/calendar/native-bridge.js','/ProjectY/life/calendar/unified-sources.js',
 '/ProjectY/yos/daystream/source-adapters.js','/ProjectY/yos/daystream/yos-tasks-auth.js'])
 assert.ok(sw.includes("'"+path+"'"),'source adapter refresh is network-first: '+path);
 assert.match(sw,/event\.request\.mode==='navigate'/);
});


test('Additive direct task import reuses original local-storage protection and UI',()=>{
 assert.match(boot,/importDirectTasks\(p\)/);
 assert.match(boot,/yos-daystream-direct-task-import-v1/);
 assert.match(boot,/if\(!web\.write\(updated\)\)return false/);
 assert.match(boot,/sourceRef:ref,done:false/);
 assert.match(boot,/const days=\{\.\.\.current\.days\}/);
 assert.match(boot,/if\(!valid\(current\)\)return false/);
 assert.match(boot,/if\(!confirm\('元のDAYSTREAMへ'/);
 assert.doesNotMatch(boot,/YOS_NOTION_INTEGRATION_TOKEN/);
 assert.equal((html.match(/id="timelinePanel"/g)||[]).length,1);
 assert.equal((html.match(/id="yosWebImport"/g)||[]).length,1);
});
