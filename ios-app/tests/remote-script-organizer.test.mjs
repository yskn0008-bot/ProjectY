import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Script Organizer.js', import.meta.url), 'utf8');

function parent(path) {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

function makeManager(root) {
  const files = new Map();
  const dirs = new Set(['/', root]);
  const manager = {
    files,
    dirs,
    documentsDirectory() { return root; },
    joinPath(a, b) { return a.replace(/\/$/, '') + '/' + b; },
    fileExists(path) { return files.has(path) || dirs.has(path); },
    isDirectory(path) { return dirs.has(path); },
    createDirectory(path) {
      const parts = path.split('/').filter(Boolean);
      let cur = '';
      for (const part of parts) { cur += '/' + part; dirs.add(cur); }
    },
    listContents(path) {
      const prefix = path.replace(/\/$/, '') + '/';
      const out = new Set();
      for (const key of [...dirs, ...files.keys()]) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (rest && !rest.includes('/')) out.add(rest);
      }
      return [...out];
    },
    move(src, dst) {
      if (!files.has(src)) throw new Error('missing ' + src);
      if (!dirs.has(parent(dst))) throw new Error('parent missing ' + parent(dst));
      const value = files.get(src);
      files.delete(src);
      files.set(dst, value);
    },
    readString(path) {
      if (!files.has(path)) throw new Error('missing ' + path);
      return files.get(path);
    },
    isFileStoredIniCloud() { return false; },
    async downloadFileFromiCloud() {}
  };
  return manager;
}

function put(manager, relative, content = 'x') {
  const path = manager.joinPath(manager.documentsDirectory(), relative);
  manager.createDirectory(parent(path));
  manager.files.set(path, content);
}

async function run(iCloud, local) {
  const alerts = [];
  class Alert {
    constructor() { this.title = ''; this.message = ''; }
    addAction() {}
    async presentAlert() { alerts.push({ title: this.title, message: this.message }); }
  }
  const Script = { complete() {} };
  const FileManager = { iCloud: () => iCloud, local: () => local };
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const fn = new AsyncFunction('FileManager', 'Alert', 'Script', source);
  await fn(FileManager, Alert, Script);
  return alerts;
}

function filePaths(manager) { return [...manager.files.keys()].sort(); }

test('keeps current Japanese scripts and archives legacy root scripts as .bak', async () => {
  const iCloud = makeManager('/icloud');
  const local = makeManager('/local');
  put(iCloud, 'リモコン.js', 'CURRENT');
  put(iCloud, 'YOS Remote Hub.js', 'OLD');
  put(iCloud, 'YOS Light Remote copy.js', 'OLD2');
  put(iCloud, 'MY WAY Widgets.js', 'OTHER');

  await run(iCloud, local);

  assert.equal(iCloud.files.get('/icloud/リモコン.js'), 'CURRENT');
  assert.equal(iCloud.files.get('/icloud/MY WAY Widgets.js'), 'OTHER');
  assert.equal(iCloud.files.has('/icloud/YOS Remote Hub.js'), false);
  assert.equal(iCloud.files.has('/icloud/YOS Light Remote copy.js'), false);
  assert.ok(filePaths(iCloud).some(path => path.endsWith('/YOS Remote Hub.js.bak')));
  assert.ok(filePaths(iCloud).some(path => path.endsWith('/YOS Light Remote copy.js.bak')));
});

test('never archives Untitled scripts even if code is an exact duplicate', async () => {
  const iCloud = makeManager('/icloud');
  const local = makeManager('/local');
  put(iCloud, 'リモコン.js', 'SAME');
  put(iCloud, 'Untitled Script 11.js', 'SAME');
  put(iCloud, 'Untitled Script 14.js', 'personal unique utility');

  await run(iCloud, local);

  assert.equal(iCloud.files.get('/icloud/Untitled Script 11.js'), 'SAME');
  assert.equal(iCloud.files.get('/icloud/Untitled Script 14.js'), 'personal unique utility');
  assert.ok(!filePaths(iCloud).some(path => path.endsWith('/Untitled Script 11.js.bak')));
});

test('preserves the user active direct remote launcher Untitled Script 9', async () => {
  const iCloud = makeManager('/icloud');
  const local = makeManager('/local');
  const launcher = '// YOS Remote 4台版 v6.6 直接起動\\n' +
    'const RELEASE = "fb1316a915ed8b0194a14fc40db5e2736f18c009";\\n' +
    'const cache = "YOS_Remote_v66_cache.json";';
  put(iCloud, 'リモコン.js', '// YOS Remote Hub v6.6');
  put(iCloud, 'Untitled Script 9.js', launcher);
  put(local, 'リモコン.js', '// YOS Remote Hub v6.5');

  await run(iCloud, local);

  assert.equal(iCloud.files.get('/icloud/Untitled Script 9.js'), launcher);
  assert.ok(!filePaths(iCloud).some(path => path.includes('Untitled Script 9.js.bak')));
  assert.equal(iCloud.files.get('/icloud/リモコン.js'), '// YOS Remote Hub v6.6');
  assert.equal(local.files.get('/local/リモコン.js'), '// YOS Remote Hub v6.5');
});

test('hides .js inside legacy archive folders but preserves successful update backup scripts for rollback', async () => {
  const iCloud = makeManager('/icloud');
  const local = makeManager('/local');
  put(iCloud, 'リモコン.js', 'CURRENT');
  put(iCloud, 'リモコン/保管/英語旧版 2026/YOS Remote Hub.js', 'OLD');
  put(iCloud, 'リモコン/保管/整理 2026/YOS Light Remote.js', 'OLD2');
  put(iCloud, 'リモコン/保管/更新前 2026/backup/リモコン.js', 'ROLLBACK');
  put(iCloud, 'YOS Remote Script Archive 2026/YOS AC Widget.js', 'OLD3');

  await run(iCloud, local);

  assert.equal(iCloud.files.has('/icloud/リモコン/保管/英語旧版 2026/YOS Remote Hub.js'), false);
  assert.ok(iCloud.files.has('/icloud/リモコン/保管/英語旧版 2026/YOS Remote Hub.js.bak'));
  assert.ok(iCloud.files.has('/icloud/リモコン/保管/整理 2026/YOS Light Remote.js.bak'));
  assert.ok(iCloud.files.has('/icloud/YOS Remote Script Archive 2026/YOS AC Widget.js.bak'));
  assert.equal(iCloud.files.get('/icloud/リモコン/保管/更新前 2026/backup/リモコン.js'), 'ROLLBACK');
});
