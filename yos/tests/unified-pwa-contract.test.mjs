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


test('YOS Chat is a chat-only surface with the new-chat icon in the header', async () => {
  const [page,app,css] = await Promise.all([
    read('yos/desk/index.html'),
    read('yos/desk/app.js'),
    read('yos/desk/unified-inbox.css')
  ]);
  assert.match(page, /<body class="chat-only">/);
  assert.doesNotMatch(page, /id="deskPage"/);
  assert.doesNotMatch(page, /<nav class="bottom"/);
  assert.match(page, /id="newBtn"[^>]+aria-label="新規チャット"/);
  assert.doesNotMatch(page, /id="selectBtn"/);
  assert.doesNotMatch(page, /data-mode="pinned"/);
  assert.match(page, /<strong>チャット<\/strong>/);
  assert.match(page, /placeholder="チャットを検索"/);
  assert.match(css, /YOS Chat — chat-only iPhone surface/);
  assert.match(css, /body\.chat-only \.app[\s\S]*height:100svh/);
  assert.match(css, /\.chatIconBtn/);
  assert.match(css, /#chatsPage \.avatar,[\s\S]*display:none !important/);
  assert.match(app, /state\.page='chats'/);
  assert.doesNotMatch(app, /renderDev\(|deskClock|deskInput|boardBtn|metricsBtn/);
});


test('YOS Chat uses unread-only emphasis and the Home Screen Badging API', async () => {
  const [app,live,css] = await Promise.all([
    read('yos/desk/app.js'),
    read('yos/desk/live-chat.js'),
    read('yos/desk/unified-inbox.css')
  ]);
  assert.match(app,/function unreadTotal\(\)/);
  assert.match(app,/navigator\.setAppBadge/);
  assert.match(app,/navigator\.clearAppBadge/);
  assert.match(app,/Notification\.requestPermission/);
  assert.match(app,/未読バッジを有効にする/);
  assert.match(live,/function latestConversation\(chatId\)/);
  assert.match(live,/return'あなた：'/);
  assert.match(live,/return'YOS：'/);
  assert.match(css,/#chatsPage \.chat\.currentChat\{background:transparent\}/);
  assert.match(css,/#chatsPage \.chat\.unread \.chatName\{font-weight:760\}/);
  assert.match(css,/background:#0a84ff/);
});


test('YOS Chat NEW supports persistent and temporary live chats', async () => {
  const [app,live] = await Promise.all([
    read('yos/desk/app.js'),
    read('yos/desk/live-chat.js')
  ]);
  assert.match(app,/id="createYosChat"/);
  assert.match(app,/id="createTemporaryChat"/);
  assert.match(app,/履歴に残さない/);
  assert.match(app,/snapshot\.chats=.*filter\(function\(x\)\{return !x\.temporary\}\)/);
  assert.match(live,/function createLiveChat\(options\)/);
  assert.match(live,/temporary:temporary/);
  assert.match(live,/globalThis\.yosDeskCreateChat=createLiveChat/);
  assert.match(live,/delete state\.chatThreads\[id\]/);
  assert.match(live,/chat\.autoTitle/);
});


test('YOS Chat automatically accepts canonical GPT original handoffs', async () => {
  const [app,importer] = await Promise.all([
    read('yos/desk/app.js'),
    read('yos/desk/import-gpt.html')
  ]);
  assert.match(app,/function canonicalChatUrl\(value\)/);
  assert.match(app,/function autoImportOriginals\(\)/);
  assert.match(app,/document\.referrer/);
  assert.match(app,/\['url','chat','gpt','source','text'\]/);
  assert.match(app,/globalThis\.yosDeskReceiveOriginal/);
  assert.match(app,/autoReadGrantedClipboard/);
  assert.match(importer,/function canonical\(value\)/);
  assert.match(importer,/location\.search/);
  assert.match(importer,/location\.hash/);
  assert.match(importer,/pick\('text'\)/);
  assert.match(importer,/location\.replace\('\.\/'\)/);
});


test('YOS Chat keeps one cross-project chat history without DESK chrome', async () => {
  const [page,js,css,sw] = await Promise.all([
    read('yos/desk/index.html'),
    read('yos/desk/unified-inbox.js'),
    read('yos/desk/unified-inbox.css'),
    read('service-worker.js')
  ]);
  assert.match(page,/unified-inbox\.css/);
  assert.match(page,/unified-inbox\.js/);
  assert.doesNotMatch(page,/id="deskPage"|>DESK<|data-page="desk"/);
  assert.match(js,/activeChatId/);
  assert.match(js,/GPT原文/);
  assert.match(js,/decorateRows/);
  assert.doesNotMatch(js,/sourceSummary|currentChatBanner/);
  assert.match(css,/background:#000/);
  assert.match(css,/#chatsPage \.chat[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(sw,/unified-inbox\.css/);
  assert.match(sw,/unified-inbox\.js/);
  assert.match(sw,/import-gpt\.html/);
});

