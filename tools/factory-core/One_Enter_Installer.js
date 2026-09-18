// One Enter Installer v2
// Saves/updates a Scriptable script, verifies the write, then waits for the user
// to tap "実行" before handing off. This avoids the immediate-open race seen on iCloud.

(async () => {
  const q = args.queryParameters || {};

  const sleep = ms => new Promise(resolve => {
    Timer.schedule(ms / 1000, false, resolve);
  });

  function fail(message) {
    throw new Error(`One Enter Installer: ${message}`);
  }

  function safeName(value) {
    const name = String(value || '').trim().replace(/\.js$/i, '');
    if (!name) fail('name is required');
    if (/[\\/:*?"<>|]/.test(name)) fail('invalid script name');
    return name;
  }

  function decodeBase64Url(value) {
    let s = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const data = Data.fromBase64String(s);
    if (!data) fail('payload decode failed');
    return data.toRawString();
  }

  async function fetchText(url) {
    const req = new Request(url);
    req.timeoutInterval = 25;
    return await req.loadString();
  }

  function chooseFileManager() {
    try {
      const cloud = FileManager.iCloud();
      cloud.documentsDirectory();
      return cloud;
    } catch (_) {
      return FileManager.local();
    }
  }

  const name = safeName(q.name);
  const sources = [q.source, q.source2, q.source3].filter(Boolean);
  let code = '';
  let usedSource = '';
  let lastError = '';

  for (const source of sources) {
    try {
      const candidate = await fetchText(source);
      if (candidate && candidate.trim().length > 20) {
        code = candidate;
        usedSource = source;
        break;
      }
    } catch (error) {
      lastError = String(error);
    }
  }

  if (!code && q.payload) {
    code = decodeBase64Url(q.payload);
    usedSource = 'inline-payload';
  }

  if (!code) fail(lastError || 'no usable source or payload');

  const fm = chooseFileManager();
  const docs = fm.documentsDirectory();
  const targetPath = fm.joinPath(docs, `${name}.js`);
  const baseDir = fm.joinPath(docs, 'One Enter Factory');
  const historyDir = fm.joinPath(baseDir, 'history');

  if (!fm.fileExists(baseDir)) fm.createDirectory(baseDir, true);
  if (!fm.fileExists(historyDir)) fm.createDirectory(historyDir, true);

  if (fm.fileExists(targetPath)) {
    try {
      if (!fm.isFileDownloaded(targetPath)) await fm.downloadFileFromiCloud(targetPath);
      const previous = fm.readString(targetPath);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fm.writeString(fm.joinPath(historyDir, `${stamp}__${name}.js`), previous);
    } catch (_) {}
  }

  fm.writeString(targetPath, code);

  await sleep(650);
  if (!fm.fileExists(targetPath)) fail('write verification failed');
  if (!fm.isFileDownloaded(targetPath)) await fm.downloadFileFromiCloud(targetPath);
  const verified = fm.readString(targetPath);
  if (verified !== code) fail('saved code does not match downloaded code');

  const receipt = {
    schema_version: '2.0.0',
    installed_at: new Date().toISOString(),
    name,
    bytes: code.length,
    source: usedSource,
    target: targetPath,
    verified: true,
    auto_executed: false
  };
  fm.writeString(fm.joinPath(baseDir, 'LAST_INSTALL.json'), JSON.stringify(receipt, null, 2));

  if (name === Script.name()) {
    const done = new Alert();
    done.title = 'One Enter Installer';
    done.message = 'インストーラーを更新しました。';
    done.addAction('OK');
    await done.presentAlert();
    Script.complete();
    return;
  }

  const alert = new Alert();
  alert.title = '準備完了';
  alert.message = `${name} を保存・検証しました。\n\nここから先だけ本人操作です。`;
  alert.addAction('▶︎ 実行');
  alert.addCancelAction('あとで');
  const choice = await alert.presentAlert();

  if (choice === 0) {
    await sleep(900);
    Safari.open(`scriptable:///run/${encodeURIComponent(name)}?openEditor=true`);
  }

  Script.complete();
})().catch(async error => {
  const alert = new Alert();
  alert.title = 'One Enter Installer';
  alert.message = String(error);
  alert.addAction('OK');
  await alert.presentAlert();
  Script.complete();
});