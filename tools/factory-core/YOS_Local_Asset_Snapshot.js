// YOS Local Asset Snapshot v2
// Read-only machine-readable inventory/diagnostics for One Enter.
// Never deletes or edits user scripts. Never exports script source or detected secrets.
(async () => {
  const SCHEMA = '2.0.0';
  const OUTPUT_DIR = 'One Enter State';
  const OUTPUT_FILE = 'local-assets.json';
  const CRITICAL = [
    'One Enter Installer',
    'YOS Life AUTO Router',
    'YOS Departure Guard2',
    'Morning Flow',
    'YOS Battery Sync'
  ];

  function iso(d) {
    try { return d ? new Date(d).toISOString() : null; } catch (_) { return null; }
  }

  function fingerprint(text) {
    let h = 0x811c9dc5;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  async function ensureDownloaded(fm, path) {
    try {
      if (typeof fm.isFileStoredIniCloud === 'function' && fm.isFileStoredIniCloud(path)) {
        await fm.downloadFileFromiCloud(path);
      }
    } catch (_) {}
  }

  async function readText(fm, path) {
    try {
      await ensureDownloaded(fm, path);
      return fm.readString(path);
    } catch (_) {
      return null;
    }
  }

  function countMatches(text, re) {
    if (!text) return 0;
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    const r = new RegExp(re.source, flags);
    const m = text.match(r);
    return m ? m.length : 0;
  }

  function semanticFlags(name, text) {
    const s = String(text || '');
    const common = {
      chars: s.length,
      fingerprint: fingerprint(s),
      has_script_complete: /\bScript\.complete\s*\(/.test(s),
      has_throw: /\bthrow\b/.test(s),
      has_alert: /\bnew\s+Alert\s*\(/.test(s)
    };

    if (name === 'YOS Life AUTO Router') {
      return {
        ...common,
        mentions_dry_run: /\bdryRun\b/.test(s),
        dry_run_occurrences: countMatches(s, /\bdryRun\b/),
        conditional_on_dry_run: /if\s*\([^)]*\bdryRun\b[^)]*\)/i.test(s) || /\bdryRun\b\s*\?/i.test(s),
        parses_json: /JSON\.parse\s*\(/.test(s),
        mentions_state: /["']state["']|\.state\b/.test(s),
        mentions_wakeup: /起床|wake\s*up|wakeup/i.test(s)
      };
    }

    if (name === 'YOS Departure Guard2') {
      return {
        ...common,
        mentions_shadow_mode: /Shadow\s*Mode|shadow[_\s-]*mode/i.test(s),
        mentions_event_store: /Event\s*Store|event[_\s-]*store/i.test(s),
        mentions_decision_pack: /Decision\s*Pack|decision[_\s-]*pack/i.test(s),
        mentions_silent_gate: /Gate\s*:\s*silent|\bsilent\b/i.test(s),
        writes_file: /writeString\s*\(|write\s*\(/.test(s),
        uses_icloud: /FileManager\.iCloud\s*\(/.test(s)
      };
    }

    return common;
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
      const text = await readText(fm, path);
      let size = null, modified_at = null;
      try { size = fm.fileSize(path); } catch (_) {}
      try { modified_at = iso(fm.modificationDate(path)); } catch (_) {}
      out.push({
        name: name.replace(/\.js$/i, ''),
        file: name,
        store,
        size,
        chars: text === null ? null : text.length,
        fingerprint: text === null ? null : fingerprint(text),
        modified_at
      });
    }

    out.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return out;
  }

  async function inspectCritical(fm, store, name) {
    if (!fm) return null;
    const path = fm.joinPath(fm.documentsDirectory(), `${name}.js`);
    if (!fm.fileExists(path)) return null;
    const text = await readText(fm, path);
    let modified_at = null;
    try { modified_at = iso(fm.modificationDate(path)); } catch (_) {}
    return {
      name,
      store,
      exists: true,
      modified_at,
      diagnostics: semanticFlags(name, text)
    };
  }

  const cloud = FileManager.iCloud();
  let local = null;
  try { local = FileManager.local(); } catch (_) {}

  const cloudScripts = await scan(cloud, 'iCloud');
  const localScripts = await scan(local, 'local');

  const critical = [];
  for (const name of CRITICAL) {
    const c = await inspectCritical(cloud, 'iCloud', name);
    const l = await inspectCritical(local, 'local', name);
    if (c) critical.push(c);
    if (l) critical.push(l);
    if (!c && !l) critical.push({ name, exists: false });
  }

  const byName = new Map();
  for (const item of [...cloudScripts, ...localScripts]) {
    if (!byName.has(item.name)) byName.set(item.name, []);
    byName.get(item.name).push(item);
  }
  const duplicates = [...byName.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([name, items]) => ({
      name,
      copies: items.map(x => ({ store: x.store, chars: x.chars, fingerprint: x.fingerprint, modified_at: x.modified_at })),
      identical: new Set(items.map(x => `${x.chars}:${x.fingerprint}`)).size === 1
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const snapshot = {
    schema_version: SCHEMA,
    generated_at: new Date().toISOString(),
    source: 'YOS Local Asset Snapshot',
    read_only: true,
    privacy: 'No script source, URLs, tokens, or credentials are included.',
    scriptable: {
      iCloud: cloudScripts,
      local: localScripts,
      total: cloudScripts.length + localScripts.length,
      duplicates
    },
    critical_assets: critical,
    shortcuts: {
      status: 'runtime_only',
      known_from_current_device_evidence: {
        run_script_has_wakeup_trigger: true,
        run_script_invokes_mother_shadow_v1: true,
        mother_shadow_v1_manual_e2e: 'PASS'
      },
      limitation: 'iOS does not expose personal automation definitions/actions to Scriptable for full enumeration. Runtime receipts or an explicit Shortcut exporter are required for machine verification.'
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
  a.message = `Scriptable ${snapshot.scriptable.total}件を検査しました。\n重要資産の診断JSONをコピー済みです。`;
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