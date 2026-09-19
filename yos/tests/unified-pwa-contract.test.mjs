import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('root manifest installs one YOS app across all main domains', async () => {
  const [manifest,index,sw,yos,life,hj,system] = await Promise.all([
    read('manifest.webmanifest'), read('index.html'), read('service-worker.js'),
    read('yos/index.html'), read('life/index.html'), read('yos/hj/index.html'), read('system/index.html')
  ]);
  const parsed=JSON.parse(manifest);
  assert.equal(parsed.name,'YOS');
  assert.equal(parsed.start_url,'./yos/');
  assert.equal(parsed.scope,'./');
  assert.match(index,/location\.replace\("\.\/yos\/"\)/);
  assert.match(sw,/yos-unified-/);
  for(const path of ['./yos/index.html','./life/index.html','./yos/hj/index.html','./system/index.html']){
    assert.ok(sw.includes("'"+path+"'"),'missing root PWA cache entry: '+path);
  }
  assert.match(yos,/href="\.\.\/manifest\.webmanifest"/);
  assert.match(life,/href="\.\.\/manifest\.webmanifest"/);
  assert.match(hj,/href="\.\.\/\.\.\/manifest\.webmanifest"/);
  assert.match(system,/YOS System｜Mission Control/);
});

test('domain pages replace scoped workers with the root YOS worker', async () => {
  const [yosApp,life,hjApp] = await Promise.all([read('yos/app.js'),read('life/index.html'),read('yos/hj/app.js')]);
  assert.match(yosApp,/register\('\.\.\/service-worker\.js',\{scope:'\.\.'\,/);
  assert.match(life,/register\('\.\.\/service-worker\.js',\{scope:'\.\.'\,/);
  assert.match(hjApp,/register\('\.\.\/\.\.\/service-worker\.js',\{scope:'\.\.\/\.\.'\,/);
});
