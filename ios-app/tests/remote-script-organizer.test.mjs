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
    isFileStoredIniCloud() { return false; },
    async downloadFileFromiCloud() {}
  };
  return manager;
}

function put(manager, name, content = 'x') {
  manager.files.set(manager.joinPath(manager.documentsDirectory(), name), content);
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

function rootNames(manager) {
  return manager.listContents(manager.documentsDirectory()).sort();
}

function archivedNames(manager) {
  const archive = rootNames(manager).find(name => name.startsWith('YOS Remote Script Archive '));
  if (!archive) return [];
  return manager.listContents(manager.joinPath(manager.documentsDirectory(), archive)).sort();
}

test('archives only recognized iCloud variants and keeps canonical/unknown scripts', async () => {
  const iCloud = makeManager('/icloud');
  const local = makeManager('/local');
  put(iCloud, 'YOS Remote Hub.js');
  put(iCloud, 'YOS Remote Hub copy.js');
  put(iCloud, 'YOS AC Widget v5.2.js');
  put(iCloud, 'YOS Battery Widget.js');

  await run(iCloud, local);

  assert.ok(iCloud.files.has('/icloud/YOS Remote Hub.js'));
  assert.ok(iCloud.files.has('/icloud/YOS Battery Widget.js'));
  assert.equal(iCloud.files.has('/icloud/YOS Remote Hub copy.js'), false);
  assert.equal(iCloud.files.has('/icloud/YOS AC Widget v5.2.js'), false);
  assert.deepEqual(archivedNames(iCloud), ['YOS AC Widget v5.2.js', 'YOS Remote Hub copy.js']);
});

test('archives exact local canonical duplicate only when iCloud canonical exists', async () => {
  const iCloud = makeManager('/icloud');
  const local = makeManager('/local');
  put(iCloud, 'YOS Remote Hub.js');
  put(local, 'YOS Remote Hub.js');
  put(local, 'YOS BRAVIA Remote.js');
  put(local, 'YOS Light Remote old.js');

  await run(iCloud, local);

  assert.equal(local.files.has('/local/YOS Remote Hub.js'), false);
  assert.ok(local.files.has('/local/YOS BRAVIA Remote.js'));
  assert.equal(local.files.has('/local/YOS Light Remote old.js'), false);
  assert.deepEqual(archivedNames(local), ['YOS Light Remote old.js', 'YOS Remote Hub.js']);
});

test('is non-destructive and idempotent when no clutter is present', async () => {
  const iCloud = makeManager('/icloud');
  const local = makeManager('/local');
  put(iCloud, 'YOS Remote Hub.js', 'hub');
  put(iCloud, 'YOS Remote Update Installer.js', 'installer');
  put(local, 'Personal Utility.js', 'personal');

  const first = await run(iCloud, local);
  const second = await run(iCloud, local);

  assert.equal(iCloud.files.get('/icloud/YOS Remote Hub.js'), 'hub');
  assert.equal(iCloud.files.get('/icloud/YOS Remote Update Installer.js'), 'installer');
  assert.equal(local.files.get('/local/Personal Utility.js'), 'personal');
  assert.equal(rootNames(iCloud).some(name => name.startsWith('YOS Remote Script Archive ')), false);
  assert.equal(rootNames(local).some(name => name.startsWith('YOS Remote Script Archive ')), false);
  assert.match(first[0].message, /見つかりませんでした/);
  assert.match(second[0].message, /見つかりませんでした/);
});
