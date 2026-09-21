import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('root manifest installs one YOS app across all main domains', async () => {
  const [manifest,index,sw,yos,guide,guideApp,life,hj,system] = await Promise.all([
    read('manifest.webmanifest'), read('index.html'), read('service-worker.js'),
    read('yos/index.html'), read('yos/guide.html'), read('yos/guide.js'),
    read('life/index.html'), read('yos/hj/index.html'), read('system/index.html')
  ]);
  const parsed=JSON.parse(manifest);
  assert.equal(parsed.name,'YOS');
  assert.equal(parsed.start_url,'./yos/');
  assert.equal(parsed.scope,'./');
  assert.match(index,/location\.replace\("\.\/yos\/"\)/);
  assert.match(sw,/yos-unified-/);
  for(const path of ['./yos/index.html','./yos/guide.html','./yos/guide.css','./yos/guide.js','./life/index.html','./yos/hj/index.html','./system/index.html']){
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
  assert.match(yos,/data-web-only href="\.\.\/system\/"/);
  assert.match(guide,/何かあった？/);
  assert.match(guide,/どこで処理するかはYOSが決めます/);
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
