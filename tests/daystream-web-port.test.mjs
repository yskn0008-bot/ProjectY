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
test('Undo/redo and three gesture intents preserve normal scroll and task data',()=>{
 assert.match(html,/id="yosUndoBtn"/);
 assert.match(html,/id="yosRedoBtn"/);
 assert.match(html,/function yosHistoryRestore\(direction\)/);
 assert.match(html,/yosHistorySnapshot\(\)/);
 assert.match(html,/task-drag-grip/);
 assert.match(html,/\.card\.task\{touch-action:pan-y\}/);
 assert.match(html,/const HOLD_TO_MOVE=260, HOLD_TO_EDIT=750/);
 assert.match(html,/mode='armed'/);
 assert.match(html,/mode==='armed'\|\|gripStart/);
 assert.match(html,/const lockBackground=\(\)=>/);
 assert.match(html,/const unlockBackground=\(\)=>/);
 assert.match(html,/addEventListener\('touchmove',preventScroll,\{capture:true,passive:false\}\)/);
 assert.match(html,/window\.addEventListener\('scroll',restoreScroll,\{passive:true\}\)/);
 assert.match(html,/active=null;clearTimers\(\);clearPaint\(\);unlockBackground\(\)/);
 assert.match(html,/if\(completedMode==='tap'&&!wasGrip\)toggleTaskDone\(item\)/);
 assert.match(html,/beginLocalEdit\(item\)/);
 assert.match(html,/少し押さえて上下に動かすと移動/);
});

test('Slim duration-aware task bars retain full text and dark casual semantic colors',()=>{
 assert.match(html,/function yosTaskDurationHeight\(duration\)/);
 for(const [minutes,pixels] of [[5,34],[15,36],[30,38],[60,42],[120,46]]){
  assert.ok(html.includes('if(duration<='+minutes+')return '+pixels+';'));
 }
 assert.match(html,/return Math\.max\(yosTaskDurationHeight\(item\.d\),contentMin\)/);
 assert.match(html,/el\.dataset\.durationBand=/);
 assert.match(html,/\.card\.task\{background:#9958d2;border-radius:11px;padding:2px 9px 2px 11px/);
 assert.match(html,/\.card\.task:before\{display:none\}/);
 assert.match(html,/return 48;/,'extended tasks also use slimmer height');
 assert.match(html,/\.card\.task\{border:1px solid #f5e8ffb8/,'foreground cards have clear borders');
 assert.match(html,/\.card\.task\.yos-backdrop\.compat-danger\{background:#654753/,'overlapping sleep background is muted');
 assert.match(html,/\.card\.task\.yos-backdrop\{background:#51445d;border:1px dashed/,'long span has separate visual style');
 assert.match(html,/\.card\.task \.task-drag-grip\{min-height:30px;min-width:38px/,'grip stays wide despite slimmer bars');

 for(const tone of ['#258e70','#aa7529','#c45e78'])
  assert.ok(html.includes('background:'+tone),'brighter semantic tone '+tone+' remains available');
 assert.doesNotMatch(html,/inset 4px 0 0/,'no left accent strip remains on task cards');
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
