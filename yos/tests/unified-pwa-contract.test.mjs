import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('root manifest installs one YOS app across all main domains', async () => {
  const [manifest,index,sw,yos,guide,guideApp,life,hj,system] = await Promise.all([
    read('manifest.webmanifest'), read('index.html'), read('service-worker.js'),
    read('yos/index.html'), read('yos/guide.html'), read('yos/guide-v2.js'),
    read('life/index.html'), read('yos/hj/index.html'), read('system/index.html')
  ]);
  const parsed=JSON.parse(manifest);
  assert.equal(parsed.name,'YOS');
  assert.equal(parsed.start_url,'./yos/');
  assert.equal(parsed.scope,'./');
  assert.match(index,/location\.replace\("\.\/yos\/"\)/);
  assert.match(sw,/yos-unified-/);
  for(const path of ['./yos/index.html','./yos/guide.html','./yos/guide.css','./yos/guide.js','./yos/guide-v2.css','./yos/guide-v2.js','./life/index.html','./yos/hj/index.html','./system/index.html']){
    assert.ok(sw.includes("'"+path+"'"),'missing root PWA cache entry: '+path);
  }
  assert.match(yos,/href="\.\.\/manifest\.webmanifest"/);
  assert.match(life,/href="\.\.\/manifest\.webmanifest"/);
  assert.match(hj,/href="\.\.\/\.\.\/manifest\.webmanifest"/);
  assert.match(system,/YOS System｜Mission Control/);
  assert.match(system,/href="\.\.\/manifest\.webmanifest"/);
  assert.match(yos,/data-web-only href="shortcuts:\/\/run-shortcut\?name=Clarity"/);
  assert.match(yos,/data-web-only href="scriptable:\/\/\/run\?scriptName=YOS%20Remote%20Hub"/);
  assert.match(yos,/class="yos-companion" href="\.\/guide\.html"/);
  assert.match(yos,/class="guide-shortcut" href="\.\/guide\.html"/);
  assert.match(yos,/data-web-only href="\.\.\/system\/"/);
  assert.match(yos,/money-v2-runtime-v4\.js/);
  assert.ok(sw.includes("'./yos/money-v2-runtime-v4.js'"),'missing versioned Money runtime cache entry');
  assert.match(guide,/今日は、どうする？/);
  assert.match(guide,/YOSに話す/);
  assert.match(guide,/data-mode="normal"/);
  assert.match(guide,/data-mode="build"/);
  assert.match(guide,/data-mode="scout"/);
  assert.match(guide,/shortcuts:\/\/run-shortcut\?name=Clarity/);
  assert.match(guide,/href="\.\.\/system\/"/);
  assert.match(guideApp,/yos-home-settings-v2/);
  assert.match(guideApp,/ユーザーにProject名・チャット・機能を選ばせず/);
  assert.match(guideApp,/One Enter／プロト君／Astra／System Health/);
  assert.match(guideApp,/必要ならSCOUT/);
});

test('domain pages replace scoped workers with the root YOS worker', async () => {
  const [yosApp,life,hjApp] = await Promise.all([read('yos/app.js'),read('life/index.html'),read('yos/hj/app.js')]);
  assert.match(yosApp,/register\('\.\.\/service-worker\.js',\{scope:'\.\.\/'\,/);
  assert.match(life,/register\('\.\.\/service-worker\.js',\{scope:'\.\.\/'\,/);
  assert.match(hjApp,/register\('\.\.\/\.\.\/service-worker\.js',\{scope:'\.\.\/\.\.\/'\,/);
});


test('manifest icons are install-ready across YOS entry pages', async () => {
  const [manifest,index,yos,life,hj,system,sw] = await Promise.all([
    read('manifest.webmanifest'), read('index.html'), read('yos/index.html'), read('life/index.html'),
    read('yos/hj/index.html'), read('system/index.html'), read('service-worker.js')
  ]);
  const parsed=JSON.parse(manifest);
  assert.deepEqual(parsed.icons?.map(icon=>icon.sizes),['180x180','512x512']);
  assert.match(index,/apple-touch-icon[^>]+\.\/assets\/yos-icon-180\.png/);
  assert.match(yos,/apple-touch-icon[^>]+\.\.\/assets\/yos-icon-180\.png/);
  assert.match(life,/apple-touch-icon[^>]+\.\.\/assets\/yos-icon-180\.png/);
  assert.match(hj,/apple-touch-icon[^>]+\.\.\/\.\.\/assets\/yos-icon-180\.png/);
  assert.match(system,/apple-touch-icon[^>]+\.\.\/assets\/yos-icon-180\.png/);
  assert.match(sw,/\.\/assets\/yos-icon-180\.png/);
  assert.match(sw,/\.\/assets\/yos-icon-512\.png/);
});


test('YOS DESK chats use a LINE-like flat conversation list', async () => {
  const [desk,compact] = await Promise.all([
    read('yos/desk/index.html'),
    read('yos/desk/compact.css')
  ]);
  assert.match(desk, /<strong>チャット<\/strong>/);
  assert.match(desk, /placeholder="チャットを検索"/);
  assert.match(compact, /LINE-like CHATS v1/);
  assert.match(compact, /#chatsPage \.chat\{[\s\S]*border-radius:0;/);
  assert.match(compact, /#chatsPage \.avatar\{[\s\S]*border-radius:50%;/);
  assert.match(compact, /#chatsPage \.preview\{[\s\S]*white-space:nowrap;/);
  assert.match(compact, /#chatsPage \.tab\.active:after/);
});


test('YOS DESK exposes Clarity SSOT freshness instead of a generic auto-sync label', async () => {
  const [desk,assets] = await Promise.all([
    read('yos/desk/app.js'),
    read('data/yos-assets.json')
  ]);
  assert.match(desk, /asset\.updated_at/);
  assert.match(desk, /SSOT<br>'\+esc\(assetStamp\)\+'取得/);
  const data=JSON.parse(assets);
  const clarity=data.assets.find(x=>x.id==='clarity');
  assert.ok(clarity.progress>=65&&clarity.progress<=100);
  assert.equal(clarity.progress_basis.device,false);
  assert.match(clarity.updated_at,/^2026-09-28/);
  assert.match(clarity.current,/Calendar登録/);
});


test('YOS DESK unified inbox keeps one cross-project list with active/read/source badges', async () => {
  const [desk,js,css,sw] = await Promise.all([
    read('yos/desk/index.html'),
    read('yos/desk/unified-inbox.js'),
    read('yos/desk/unified-inbox.css'),
    read('service-worker.js')
  ]);
  assert.match(desk,/unified-inbox\.css/);
  assert.match(desk,/unified-inbox\.js/);
  assert.match(js,/activeChatId/);
  assert.match(js,/会話中/);
  assert.match(js,/GPT原文/);
  assert.match(js,/未読/);
  assert.match(js,/既読/);
  assert.match(js,/プロジェクト横断/);
  assert.match(css,/\.currentChatBanner/);
  assert.match(css,/\.currentBadge/);
  assert.match(css,/\.readState/);
  assert.match(sw,/unified-inbox\.css/);
  assert.match(sw,/unified-inbox\.js/);
});
