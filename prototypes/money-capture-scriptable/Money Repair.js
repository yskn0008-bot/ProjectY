// Money Repair — storage-safe installer
// Repairs Money Core and Money Bridge in both Scriptable storage locations.

const sources = {
  core: 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/2be439af2259dc699e11438ff831f33b27b3d20e/prototypes/money-capture-scriptable/YOS%20Money%20Capture.js',
  bridge: 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/2be439af2259dc699e11438ff831f33b27b3d20e/prototypes/money-capture-scriptable/YOS%20Money%20Clarity%20Bridge.js'
};

async function fetchFresh(url) {
  const req = new Request(`${url}?repair=${Date.now()}-${Math.random()}`);
  req.headers = { 'Cache-Control': 'no-cache' };
  return await req.loadString();
}

function validateCore(code) {
  if (!code.includes("const APP_VERSION = '2026-09-17-p0.1'")) throw new Error('Money Core source mismatch');
  if (!code.includes('module.exports={parseJapaneseNumberToken')) throw new Error('Money Core exports missing');
  if (code.includes("importModule('Money Core')") || code.includes("importModule(\"Money Core\")")) throw new Error('Money Core self-import detected');
}

function validateBridge(code) {
  if (!code.includes("const core = importModule('Money Core')")) throw new Error('Money Bridge source mismatch');
  if (!code.includes("core.toTransaction(candidate, 'clarity', now)")) throw new Error('Money Bridge clarity source missing');
}

function writeTo(fm, name, code) {
  const path = fm.joinPath(fm.documentsDirectory(), name);
  fm.writeString(path, code);
  const saved = fm.readString(path);
  if (saved !== code) throw new Error(`${name} verify failed`);
}

try {
  const core = await fetchFresh(sources.core);
  const bridge = await fetchFresh(sources.bridge);
  validateCore(core);
  validateBridge(bridge);

  for (const fm of [FileManager.iCloud(), FileManager.local()]) {
    writeTo(fm, 'Money Core.js', core);
    writeTo(fm, 'Money Bridge.js', bridge);
  }

  const a = new Alert();
  a.title = '修復完了';
  a.message = 'Money Core / Money Bridge を検証付きで再配置しました。Scriptableを完全終了してから再テストしてください。';
  a.addAction('OK');
  await a.presentAlert();
} catch (e) {
  const a = new Alert();
  a.title = '修復エラー';
  a.message = String(e);
  a.addAction('OK');
  await a.presentAlert();
}

Script.complete();
