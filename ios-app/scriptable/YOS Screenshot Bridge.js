// YOS Screenshot Bridge — draft client, not installed or verified on iPhone.
// Shortcut must explicitly pass a JSON string containing the screenshot bytes.
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
  if (typeof input !== 'string') throw Error('ショートカットから画像データが渡されていません');
  let payload;
  try { payload = JSON.parse(input); } catch { throw Error('画像データの形式が不正です'); }
  if (!payload || payload.source !== 'ios-screenshot' ||
      !['photos', 'files', 'clipboard'].includes(payload.saveLocation) ||
      typeof payload.imageBase64 !== 'string' || !payload.imageBase64 ||
      typeof payload.captureId !== 'string' || !payload.captureId ||
      typeof payload.capturedAt !== 'string' ||
      !['image/png', 'image/jpeg', 'image/heic'].includes(payload.mimeType)) {
    throw Error('スクショ情報が不足しています');
  }
  if (payload.imageBase64.length > 4_000_000) throw Error('画像が大きすぎます（3MB以内に縮小が必要）');
  return payload;
}
async function main() {
  try {
    const payload = readPayload(args.shortcutParameter);
    if (!Keychain.contains(KEY)) throw Error('認証設定がありません');
    const req = new Request(ENDPOINT);
    req.method = 'POST';
    req.headers = {'Authorization': 'Bearer ' + Keychain.get(KEY), 'Content-Type': 'application/json'};
    req.body = JSON.stringify(payload);
    req.timeoutInterval = 30;
    const result = await req.loadJSON();
    if (req.response.statusCode !== 200 && req.response.statusCode !== 201) {
      if (req.response.statusCode === 409) throw Error('保存結果が不明です。Notion Inboxを確認してください');
      throw Error('保存できませんでした（HTTP ' + req.response.statusCode + '）');
    }
    if (result.ok !== true || result.inboxSaved !== true || result.captureId !== payload.captureId) {
      throw Error('保存結果を確認できませんでした');
    }
    // Inbox success is silent. Classification remains pending and is NOT claimed complete.
    Script.setShortcutOutput('YOS_INBOX_SAVED');
  } catch (error) {
    await alertFailure(String(error.message || error));
    Script.setShortcutOutput('YOS_INTAKE_FAILED');
  }
}
await main();
Script.complete();
