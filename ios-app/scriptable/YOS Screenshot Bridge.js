// Variables used by Scriptable.
// icon-color: gray; icon-glyph: camera;
// YOS_SCRIPT_NAME: YOS Screenshot Bridge
// YOS Screenshot Bridge — draft client, not installed or verified on iPhone.
// Shortcut must pass trigger-bound original base64 bytes and stable metadata.
// Never infer the image from the latest photo or clipboard.
const ENDPOINT = 'https://project-y-yos-ai.vercel.app/api/yos/intake?mode=screenshot';
const KEY = 'YOS_CLARITY_INTAKE_TOKEN';
async function alertFailure(message) {
  const n = new Notification();
  n.title = 'YOS｜スクショ取り込み失敗';
  n.body = message;
  await n.schedule();
}
function readPayload(input) {
  // Require trigger-bound original bytes and event metadata. An Image alone
  // cannot prove the save destination/event identity and would be re-encoded.
  let payload = input;
  if (typeof Image !== 'undefined' && input instanceof Image) {
    throw Error('撮影イベントのID・保存先・元画像データが必要です。原画像は変更していません');
  }
  if (typeof input === 'string') {
    try { payload = JSON.parse(input); } catch { throw Error('画像データの形式が不正です'); }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw Error('ショートカットから画像データが渡されていません');
  }
  // Never generate a new identity on retry or infer destination/type/time.
  if (!payload || payload.source !== 'ios-screenshot' ||
      !['photos', 'files', 'clipboard'].includes(payload.saveLocation) ||
      typeof payload.imageBase64 !== 'string' || !payload.imageBase64 ||
      typeof payload.captureId !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(payload.captureId) ||
      typeof payload.capturedAt !== 'string' || !Number.isFinite(Date.parse(payload.capturedAt)) ||
      !['image/png', 'image/jpeg', 'image/heic'].includes(payload.mimeType)) {
    throw Error('スクショ情報が不足しています');
  }
  if (payload.imageBase64.length > 4_000_000) throw Error('画像が大きすぎます（3MB以内に縮小が必要）');
  return payload;
}
function retainPayload(payload) {
  // Private local spool; never modify/delete the Photos/Files/Clipboard original.
  // Exact same captureId resumes the same bytes. A collision fails closed.
  const fm = FileManager.local();
  const dir = fm.joinPath(fm.documentsDirectory(), 'YOS Screenshot Pending');
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  const path = fm.joinPath(dir, encodeURIComponent(payload.captureId) + '.json');
  const serialized = JSON.stringify({captureId: payload.captureId, capturedAt: payload.capturedAt,
    source: payload.source, saveLocation: payload.saveLocation, mimeType: payload.mimeType,
    imageBase64: payload.imageBase64});
  if (fm.fileExists(path) && fm.readString(path) !== serialized) throw Error('同じ撮影IDの画像が異なります。送信を停止しました');
  if (!fm.fileExists(path)) fm.writeString(path, serialized);
  if (fm.readString(path) !== serialized) throw Error('端末への保全を確認できないため送信を停止しました');
  return {fm, path};
}
async function main() {
  try {
    const payload = readPayload(args.shortcutParameter);
    if (!Keychain.contains(KEY)) throw Error('認証設定がありません');
    retainPayload(payload);
    let saved = false;
    let receipt;
    for (let attempt = 0; attempt < 2; attempt++) {
      const req = new Request(ENDPOINT);
      req.method = 'POST';
      req.headers = {'Authorization': 'Bearer ' + Keychain.get(KEY), 'Content-Type': 'application/json'};
      req.body = JSON.stringify(payload);
      req.timeoutInterval = 30;
      let result;
      try { result = await req.loadJSON(); }
      catch { throw Error('通信結果が不明です。自動再送せずInboxを確認してください'); }
      const status = req.response?.statusCode;
      if (status === 200 || status === 201) {
        if (result?.ok !== true || result.inboxSaved !== true || result.captureId !== payload.captureId ||
            typeof result.imageBlockId !== 'string' || typeof result.metadataBlockId !== 'string' ||
            !/^[a-f0-9]{64}$/.test(result.imageSha256 || '')) {
          throw Error('保存結果を確認できませんでした');
        }
        receipt = result;
        saved = true;
        break;
      }
      if (status === 409) throw Error('保存結果が不明です。Notion Inboxを確認してください');
      if (status !== 503 || attempt === 1) throw Error('保存できませんでした（HTTP ' + status + '）');
      // A 503 before Notion append is safe to retry with the same capture ID.
      // Retry immediately once; no timers or background execution required.
    }
    if (!saved) throw Error('保存できませんでした');
    // Inbox success is silent. Classification remains pending and is NOT claimed complete.
    Script.setShortcutOutput(JSON.stringify({status: 'YOS_INBOX_SAVED', ...receipt}));
  } catch (error) {
    await alertFailure(String(error.message || error));
    Script.setShortcutOutput('YOS_INTAKE_FAILED');
  }
}
await main();
Script.complete();
