// YOS Local Asset Snapshot v1
// Read-only inventory for One Enter. Never deletes or edits user scripts.
// Writes a machine-readable snapshot to iCloud Drive/Scriptable/One Enter State/local-assets.json.

(async () => {
  const SCHEMA = '1.0.0';
  const OUTPUT_DIR = 'One Enter State';
  const OUTPUT_FILE = 'local-assets.json';

  function iso(d) {
    try { return d ? new Date(d).toISOString() : null; } catch (_) { return null; }
  }

  async function ensureDownloaded(fm, path) {
    try {
      if (typeof fm.isFileStoredIniCloud === 'function' && fm.isFileStoredIniCloud(path)) {
        await fm.downloadFileFromiCloud(path);
      }
    } catch (_) {}
  }

  async function scan(fm, store) {
    if (!fm) return [];
    const root = fm.documentsDirectory();
    let names = [];
    try { names = fm.listContents(root); } catch (_) { return []; }
    const out = [];
    for (const name of names) {
      if (!/\.js$/i.test(name)) continue;
      const path = fm.joinPath(root, name);
      await ensureDownloaded(fm, path);
      let size = null, modified_at = null;
      try { size = fm.fileSize(path); } catch (_) {}
      try { modified_at = iso(fm.modificationDate(path)); } catch (_) {}
      out.push({ name: name.replace(/\.js$/i, ''), file: name, store, size, modified_at });
    }
    out.sort((a,b) => a.name.localeCompare(b.name, 'ja'));
    return out;
  }

  const cloud = FileManager.iCloud();
  let local = null;
  try { local = FileManager.local(); } catch (_) {}

  const cloudScripts = await scan(cloud, 'iCloud');
  const localScripts = await scan(local, 'local');
  const snapshot = {
    schema_version: SCHEMA,
    generated_at: new Date().toISOString(),
    source: 'YOS Local Asset Snapshot',
    read_only: true,
    scriptable: {
      iCloud: cloudScripts,
      local: localScripts,
      total: cloudScripts.length + localScripts.length
    },
    shortcuts: {
      status: 'device_api_unavailable_to_scriptable',
      note: 'Scriptable cannot enumerate Apple Shortcuts. A companion Shortcut exporter is required for names/actions.'
    }
  };

  const dir = cloud.joinPath(cloud.documentsDirectory(), OUTPUT_DIR);
  if (!cloud.fileExists(dir)) cloud.createDirectory(dir, true);
  const path = cloud.joinPath(dir, OUTPUT_FILE);
  const body = JSON.stringify(snapshot, null, 2);
  cloud.writeString(path, body);

  if (!cloud.fileExists(path)) throw new Error('snapshot write verification failed');
  await ensureDownloaded(cloud, path);
  const check = cloud.readString(path);
  if (check !== body) throw new Error('snapshot read-back verification failed');

  Pasteboard.copyString(body);

  const a = new Alert();
  a.title = 'One Enter State';
  a.message = `Scriptable ${snapshot.scriptable.total}件を保存しました。\nJSONはコピー済みです。`;
  a.addAction('OK');
  await a.presentAlert();
  Script.complete();
})().catch(async error => {
  const a = new Alert();
  a.title = 'One Enter State';
  a.message = String(error && error.message ? error.message : error);
  a.addAction('OK');
  await a.presentAlert();
  Script.complete();
});