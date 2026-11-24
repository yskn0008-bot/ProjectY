// Variables used by Scriptable.
// YOS_SCRIPT_NAME: YOS BRAVIA Picture Check
// Read-only picture capability diagnostic for the already paired BRAVIA.
// Does not issue set requests, save data, or change the existing remote.
const HOST_KEY = "yos.bravia.scriptable.host";
const PSK_KEY = "yos.bravia.scriptable.psk";
const SAFE_TARGETS = ["pictureMode", "brightness"];

function readConnection() {
  if (!Keychain.contains(HOST_KEY) || !Keychain.contains(PSK_KEY)) {
    throw new Error("BRAVIA接続設定がありません。既存リモコンの設定を確認してください。");
  }
  const raw = String(Keychain.get(HOST_KEY) || "").trim();
  const host = raw.replace(/^https?:\/\//i, "").replace(/:\d+$/, "").replace(/\/$/, "");
  const psk = String(Keychain.get(PSK_KEY) || "");
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || !psk) {
    throw new Error("既存BRAVIAの接続設定を読み取れませんでした。");
  }
  return {host, psk};
}
async function readTarget(connection, target) {
  if (!SAFE_TARGETS.includes(target)) throw new Error("許可されていない診断項目です。");
  const req = new Request("http://" + connection.host + "/sony/video");
  req.method = "POST";
  req.timeoutInterval = 8;
  req.headers = {"Content-Type":"application/json", "X-Auth-PSK":connection.psk};
  req.body = JSON.stringify({method:"getPictureQualitySettings",params:[{target}],id:1,version:"1.0"});
  const data = JSON.parse(await req.loadString());
  if (data && Array.isArray(data.error)) throw new Error("API非対応・拒否（" + String(data.error[0]) + "）");
  const items = data && Array.isArray(data.result) ? data.result.flat(3) : [];
  const item = items.find(x => x && typeof x === "object" && x.target === target && x.isAvailable !== false);
  if (!item) throw new Error("設定を取得できませんでした。");
  return item;
}
function summarize(item, target) {
  const candidates = Array.isArray(item.candidate) ? item.candidate : [];
  const current = String(item.currentValue == null ? "不明" : item.currentValue);
  if (target === "pictureMode") {
    const modes = candidates.map(x => x && x.value).filter(x => x != null && String(x) !== "").map(String);
    const preview = modes.slice(0,12).join("・") + (modes.length > 12 ? " ほか" : "");
    return "画質モード：取得できました\n現在：" + current + "\n選択肢：" + (preview || "機種から取得できません");
  }
  const range = candidates.find(x => x && Number.isFinite(Number(x.min)) && Number.isFinite(Number(x.max)) && Number.isFinite(Number(x.step)) && Number(x.step) > 0 && Number(x.max) > Number(x.min));
  return "明るさ：取得できました\n現在：" + current + "\n調整範囲：" + (range ? range.min + "〜" + range.max + "（刻み" + range.step + "）" : "取得できません");
}
async function run() {
  const alert = new Alert();
  alert.title = "BRAVIA画質・安全診断";
  let lines = [];
  try {
    const connection = readConnection();
    for (const target of SAFE_TARGETS) {
      try { lines.push(summarize(await readTarget(connection, target), target)); }
      catch (error) { lines.push((target === "pictureMode" ? "画質モード" : "明るさ") + "：未確認\n" + (error && error.message ? error.message : String(error))); }
    }
  } catch (error) {
    lines = [error && error.message ? error.message : String(error)];
  }
  alert.message = lines.join("\n\n") + "\n\n※読み取り専用。テレビ・設定・認証情報を変更しません。";
  alert.addAction("閉じる");
  await alert.presentAlert();
}
await run();
Script.complete();
