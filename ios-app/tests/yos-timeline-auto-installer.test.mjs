import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../scriptable/YOS Timeline Installer.js', import.meta.url), 'utf8');
const launcher = readFileSync(new URL('../scriptable/YOS Timeline Auto.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function install(options = {}) {
  const files = options.files ?? new Map();
  const calls = { fetched: 0, completed: 0 };
  const name = options.name ?? 'YOS Timeline Auto';
  const downloaded = options.downloaded ?? launcher;
  class Alert {
    addTextField() {}
    addAction() {}
    addCancelAction() {}
    textFieldValue() { return name; }
    async presentAlert() { return options.cancel ? -1 : 0; }
  }
  class Request {
    constructor(url) {
      assert.equal(url, 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/main/ios-app/scriptable/YOS%20Timeline%20Auto.js');
      this.response = { statusCode: options.status ?? 200 };
    }
    async loadString() { calls.fetched++; return downloaded; }
  }
  const fm = {
    documentsDirectory: () => '/scripts',
    joinPath: (folder, file) => folder + '/' + file,
    fileExists: path => files.has(path),
    readString: path => files.get(path),
    writeString: (path, value) => files.set(path, value),
  };
  const execute = new AsyncFunction('Alert', 'Request', 'FileManager', 'Script', source);
  await execute(Alert, Request, { local: () => fm }, { complete: () => { calls.completed++; } });
  return { files, calls };
}

test('current auto launcher registers with chosen name and verified bytes', async () => {
  assert.match(launcher, /^\/\/ YOS Timeline Auto v1\.\d+/m);
  const result = await install({ name: 'My Timeline' });
  assert.equal(result.files.get('/scripts/My Timeline.js'), launcher);
  assert.equal(result.calls.fetched, 1);
  assert.equal(result.calls.completed, 1);
});

test('earlier compatible v1.4 launcher also installs', async () => {
  const older = launcher.replace(/^\/\/ YOS Timeline Auto v1\.\d+/m, '// YOS Timeline Auto v1.4');
  const result = await install({ downloaded: older });
  assert.equal(result.files.get('/scripts/YOS Timeline Auto.js'), older);
});

test('future incompatible major version is rejected', async () => {
  const incompatible = launcher.replace(/^\/\/ YOS Timeline Auto v1\.\d+/m, '// YOS Timeline Auto v2.0');
  const files = new Map();
  await assert.rejects(install({ downloaded: incompatible, files }), /取得検証に失敗/);
  assert.equal(files.size, 0);
});

test('unrelated source and HTTP errors are rejected without writing', async () => {
  for (const options of [
    { downloaded: '// YOS Timeline Auto v1.5\nclass WebView {}' },
    { status: 404 },
  ]) {
    const files = new Map();
    await assert.rejects(install({ ...options, files }), /取得検証に失敗/);
    assert.equal(files.size, 0);
  }
});

test('an existing name must never be overwritten', async () => {
  const files = new Map([['/scripts/YOS Timeline Auto.js', 'KEEP ORIGINAL']]);
  await assert.rejects(install({ files }), /上書きしません/);
  assert.equal(files.get('/scripts/YOS Timeline Auto.js'), 'KEEP ORIGINAL');
});

test('cancel and invalid names never download or create scripts', async () => {
  const canceled = await install({ cancel: true });
  assert.equal(canceled.calls.fetched, 0);
  assert.equal(canceled.files.size, 0);
  const files = new Map();
  await assert.rejects(install({ name: '../bad', files }), /使用できない名前/);
  assert.equal(files.size, 0);
});
