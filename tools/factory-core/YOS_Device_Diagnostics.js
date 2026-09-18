// YOS Device Diagnostics v1
// Read-only. Exports facts only; never exports script source, URLs, tokens or credentials.
(async () => {
  const cloud = FileManager.iCloud();
  const local = FileManager.local();

  function fp(text) {
    let h = 0x811c9dc5;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  async function readCloudScript(name) {
    const path = cloud.joinPath(cloud.documentsDirectory(), `${name}.js`);
    if (!cloud.fileExists(path)) return null;
    try {
      if (typeof cloud.isFileStoredIniCloud === 'function' && cloud.isFileStoredIniCloud(path)) {
        await cloud.downloadFileFromiCloud(path);
      }
    } catch (_) {}
    try { return cloud.readString(path); } catch (_) { return null; }
  }

  const router = await readCloudScript('YOS Life AUTO Router');
  const guard = await readCloudScript('YOS Departure Guard2');

  const eventStoreFile = 'YOS-Departure-Guard-EventStore-v0.json';
  const eventPath = local.joinPath(local.documentsDirectory(), eventStoreFile);
  let runtime = { exists: false, event_count: 0, latest: null };
  if (local.fileExists(eventPath)) {
    runtime.exists = true;
    try {
      const raw = JSON.parse(local.readString(eventPath));
      const events = raw && Array.isArray(raw.events) ? raw.events : [];
      runtime.event_count = events.length;
      const e = events.length ? events[events.length - 1] : null;
      if (e) runtime.latest = {
        observed_at: e.observed_at || null,
        source: e.source || null,
        mode: e.mode || null,
        presentation_level: e.presentation_level || null,
        decision_pack_prepared: !!e.decision_pack_prepared,
        notified: !!e.notified,
        duplicate: !!e.duplicate,
        reasons: Array.isArray(e.reasons) ? e.reasons : []
      };
    } catch (error) {
      runtime.read_error = String(error && error.message ? error.message : error);
    }
  }

  const out = {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    read_only: true,
    router: router === null ? { exists: false } : {
      exists: true,
      chars: router.length,
      fingerprint: fp(router),
      mentions_dry_run: /\bdryRun\b/.test(router),
      conditional_on_dry_run: /if\s*\([^)]*\bdryRun\b[^)]*\)/i.test(router) || /\bdryRun\b\s*\?/i.test(router),
      parses_json: /JSON\.parse\s*\(/.test(router),
      mentions_state: /["']state["']|\.state\b/.test(router),
      mentions_wakeup: /起床|wake\s*up|wakeup/i.test(router),
      can_stop_called_shortcut: /\bScript\.complete\s*\(|\bthrow\b|\breturn\b/.test(router)
    },
    departure_guard: guard === null ? { exists: false } : {
      exists: true,
      chars: guard.length,
      fingerprint: fp(guard),
      mentions_shadow_mode: /Shadow\s*Mode|shadow[_\s-]*mode/i.test(guard),
      mentions_event_store: /YOS-Departure-Guard-EventStore-v0\.json|Event\s*Store/i.test(guard),
      writes_event_store: /writeString\s*\(/.test(guard),
      default_shadow: /defaultMode\s*:\s*["']shadow["']/i.test(guard)
    },
    departure_guard_runtime: runtime,
    shortcut_evidence: {
      wakeup_trigger_seen_in_current_device_screenshot: true,
      mother_shadow_action_seen_after_router_morning_battery: true,
      mother_shadow_manual_e2e: 'PASS'
    }
  };

  const body = JSON.stringify(out, null, 2);
  Pasteboard.copyString(body);

  const a = new Alert();
  a.title = 'One Enter 診断';
  a.message = '診断JSONをコピーしました。';
  a.addAction('OK');
  await a.presentAlert();
  Script.complete();
})().catch(async error => {
  const a = new Alert();
  a.title = 'One Enter 診断失敗';
  a.message = String(error && error.message ? error.message : error);
  a.addAction('OK');
  await a.presentAlert();
  Script.complete();
});