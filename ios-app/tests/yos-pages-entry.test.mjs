import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('YOS iOS shell opens MY WAY natively while preserving the public system entry', async () => {
  const [dashboard, index, system, prepare, yosIndex, yosApp] = await Promise.all([
    readFile(new URL('../shell/yos-dashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../shell/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../shell/system.html', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/prepare-web.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../yos/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../yos/app.js', import.meta.url), 'utf8')
  ]);

  assert.match(index, /id="native-yos-boot"/);
  assert.match(index, /location\.protocol === 'capacitor:'/);
  assert.match(index, /location\.replace\('\.\/yos\/'\)/);

  assert.match(system, /本人タスクQueue/);
  assert.match(system, /資産進捗/);
  assert.match(system, /yos-dashboard\.js/);

  assert.match(prepare, /resolve\(repoDir, 'yos'\)/);
  assert.match(prepare, /resolve\(webDir, 'yos'\)/);
  assert.match(prepare, /resolve\(repoDir, 'life'\)/);
  assert.match(prepare, /manifest\.webmanifest/);
  assert.match(prepare, /service-worker\.js/);
  assert.match(prepare, /yos-icon-180\.png/);
  assert.match(prepare, /yos-icon-512\.png/);

  assert.match(yosIndex, /id="brandTitle">MY WAY/);
  assert.match(yosIndex, /data-native-only hidden href="\.\.\/capture\.html"/);
  assert.match(yosIndex, /data-native-only hidden href="\.\.\/bravia\.html"/);
  assert.match(yosIndex, /data-native-only hidden href="\.\.\/system\.html"/);
  assert.match(yosApp, /const nativeShell=location\.protocol==='capacitor:'/);
  assert.match(yosIndex, /money-v2\.css\?v=2/);
  assert.match(yosIndex, /money-reference-v1\.css\?v=1/);
  assert.match(yosIndex, /money-readable-v3\.css\?v=3/);
  assert.match(yosIndex, /money-master-v1\.js\?v=20260923v4/);
  assert.match(yosIndex, /money-v2-runtime-v4\.js/);
  assert.match(yosIndex, /money-reference-v1\.js\?v=1/);

  assert.match(dashboard, /location\.hostname\.endsWith\('github\.io'\)/);
  assert.match(dashboard, /\.\.\/\.\.\/data\/\$\{filename\}/);
  assert.match(dashboard, /\.\.\/\.\.\/life\//);
});
