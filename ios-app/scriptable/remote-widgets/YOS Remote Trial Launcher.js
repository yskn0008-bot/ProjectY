// YOS Remote Trial Launcher v1.1 — read-only isolated MY REMOTE v6.6 preview.
// Does not overwrite, rename, archive, or execute the multi-file installer.
// All current Scriptable .js files and existing Keychain credentials are retained.
// The two verified program sources are cached only as LOCAL non-.js data.
const RELEASE = 'fb1316a915ed8b0194a14fc40db5e2736f18c009';
const BASE = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/' +
  RELEASE + '/ios-app/scriptable/remote-widgets/';
const DOCUMENTS = FileManager.local();
const CACHE_PATH = DOCUMENTS.joinPath(
  DOCUMENTS.documentsDirectory(), 'YOS_Remote_Trial_v1_1_cache.json'
);
const REPLACEMENTS = [
  ['YOS Remote Hub','リモコン'],
  ['YOS BRAVIA Remote','テレビリモコン'],
  ['YOS BRAVIA Widget','テレビウィジェット'],
  ['YOS AC Remote','エアコンリモコン'],
  ['YOS AC Widget','エアコンウィジェット'],
  ['YOS Light Remote','照明リモコン'],
  ['YOS Light Widget','照明ウィジェット'],
  ['YOS Tapo H110 Core','リモコン/内部/Tapo共通']
];

function checkBundle(b) {
  return b && b.release === RELEASE &&
    typeof b.hub === 'string' && b.hub.includes('YOS Remote Hub v6.6') &&
    b.hub.includes('function bindTVSeekHold(') &&
    b.hub.includes('async function controlFloor(action,value)') &&
    typeof b.core === 'string' && b.core.includes('clientForHost') &&
    b.core.includes('module.exports=') &&
    typeof b.repair === 'string' && b.repair.includes('YOS Widget Link Repair v1.0');
}
async function downloadSource(name) {
  const r = new Request(BASE + encodeURIComponent(name));
  r.timeoutInterval = 25;
  const content = await r.loadString();
  if (!r.response || r.response.statusCode !== 200 || !content || content.length < 100) {
    throw new Error(name + ' の取得に失敗（HTTP ' +
      (r.response ? r.response.statusCode : '不明') + '）');
  }
  return content;
}
async function readBundle() {
  try {
    if (DOCUMENTS.fileExists(CACHE_PATH)) {
      const saved = JSON.parse(DOCUMENTS.readString(CACHE_PATH));
      if (checkBundle(saved)) return saved;
    }
  } catch (_) {
    // Corrupt optional cache is ignored. We only write this local JSON.
  }
  const b = {
    release: RELEASE,
    hub: await downloadSource('YOS Remote Hub.js'),
    core: await downloadSource('YOS Tapo H110 Core.js'),
    repair: await downloadSource('YOS Widget Link Repair.js')
  };
  if (!checkBundle(b)) throw new Error('取得した試用版コードの検証に失敗しました。');
  try {
    DOCUMENTS.writeString(CACHE_PATH, JSON.stringify(b));
    if (!checkBundle(JSON.parse(DOCUMENTS.readString(CACHE_PATH))))
      DOCUMENTS.remove(CACHE_PATH);
  } catch (_) {
    // Failed cache is non-fatal: preview can still execute in memory.
  }
  return b;
}
function localized(source) {
  let text = source;
  for (const [from,to] of REPLACEMENTS) text = text.split(from).join(to);
  return text;
}
async function runPreview() {
  const b = await readBundle();

  // Apply a narrow, backup-protected repair only to the two widget URL links.
  // A failed repair does not prevent use of the existing working remote.
  try {
    const repairModule = { exports: {} };
    const widgetDoctor = new Function('module', b.repair + '\nreturn module.exports;')(repairModule);
    const result = await widgetDoctor.repairWidgets();
    if (result.updated.length || result.missing.length) {
      const a = new Alert();
      a.title = '照明・エアコン ウィジェット確認';
      a.message = '操作リンク修正: ' + (result.updated.join('、') || 'なし') +
        (result.missing.length?' / 見つからない: '+result.missing.join('、'):'')+
        '\n変更前のコードは端末に保存しています。';
      a.addAction('OK');
      await a.presentAlert();
    }
  } catch (error) {
    const a = new Alert();
    a.title = 'ウィジェット修復は未完了';
    a.message = String(error&&error.message||error);
    a.addAction('リモコンを開く');
    await a.presentAlert();
  }

  // Evaluate the new Tapo core in memory. It reuses existing Keychain
  // credentials, never writes them and never alters the installed module.
  const localModule = { exports: {} };
  const coreFactory = new Function('module', b.core + '\nreturn module.exports;');
  const core = coreFactory(localModule);
  if (!core || typeof core.clientForHost !== 'function')
    throw new Error('フロアランプの操作機能を読み込めませんでした。');

  const installedImport = importModule;
  function previewImport(name) {
    if (String(name) === 'リモコン/内部/Tapo共通' ||
        String(name) === 'YOS Tapo H110 Core') return core;
    return installedImport(name);
  }
  const page = localized(b.hub);
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction('args','Script','config','importModule',page)(
    args, Script, config, previewImport
  );
}
await runPreview();
