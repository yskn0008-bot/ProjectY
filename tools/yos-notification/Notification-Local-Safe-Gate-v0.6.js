// YOS Notification Local Safe Gate v0.6 | Scriptable | no model, network, or notifications.
// Shortcut input: the ORIGINAL notification/Shortcut Input, not Context, GPT response, or a status string.
// Shortcut output: an exact YOS_ALERT with P0/P1 ONLY for clearly actionable high-risk text.
// Return empty string for unknown/SILENT/input missing. Existing app alerts and Inbox capture stay enabled.
const RECEIPTS = "YOS_NOTIFICATION_LOCAL_GATE_V06";
const SILENCE_MS = 6 * 60 * 60 * 1000;
function rawText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(rawText).filter(Boolean).join("\n").slice(0,3000);
  if (value && typeof value === "object") {
    return ["app","title","subtitle","message","body","text"].map(k =>
      typeof value[k] === "string" && value[k].trim() ? k + ": " + value[k].trim() : "").filter(Boolean).join("\n");
  }
  return "";
}
function mask(value) {
  return String(value).replace(/(?:password|パスワード|token|APIキー|secret)\s*[:：=]\s*\S+/gi,"[秘密非表示]")
    .replace(/(^|[^\d])(?:\d[\s-]?){12,27}\d(?=[^\d]|$)/g,"$1[長い番号非表示]")
    .replace(/\b0\d{9,10}\b/g,"[電話番号非表示]")
    .replace(/https?:\/\/\S+/gi,"[URL非表示]")
    .replace(/[\x00-\x1f<>]/g," ").trim().slice(0,230);
}
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h,16777619); }
  return (h>>>0).toString(16).padStart(8,"0");
}
function decision(value) {
  const input = rawText(value);
  if (!input || /^(?:1|true|\[object Object\]|ショートカットの入力|YOS:.*)$/i.test(input)) return {message:"",reason:"no_notification"};
  // Never process OTP, login secrets, or short one-time verification notifications.
  if (/認証コード|確認コード|ワンタイム|二段階認証|ログインコード|verification\s*code|one.?time|\bOTP\b|\b2FA\b|security\s*code|パスワードリセット/i.test(input)) {
    return {message:"",reason:"security_secret"};
  }
  if (/広告|キャンペーン|ポイント還元|クーポン|おすすめ商品|お得な情報|注文完了|配送完了|支払い完了|決済完了|予約完了|お届け完了/u.test(input) &&
      !/不正利用|不正送金|差押|差し押さえ|督促|訴状|口座凍結/u.test(input)) {
    return {message:"",reason:"ordinary"};
  }
  // Explicit negatives should not become alerts.
  if (/不正利用(?:は|が)(?:確認|検出)されません|不審なログイン(?:は|が)(?:確認|検出)されません/u.test(input)) {
    return {message:"",reason:"negative"};
  }
  const risk = /差押|差し押さえ|督促|訴状|裁判所|口座凍結|不正送金|不正利用|不審なログイン|振込失敗|引落失敗|引き落としに失敗|支払期限|支払い期限|対応期限|提出期限|回答期限|面接.*変更|キャンセル料.*期限/u;
  if (!risk.test(input)) return {message:"",reason:"silent"};
  const p0 = /差押|差し押さえ|口座凍結|不正送金|不正利用|訴状/u.test(input);
  const priority = p0 ? "P0" : "P1";
  const body = mask(input);
  const message = [
    "YOS_ALERT", "優先度: " + priority,
    "事実: " + body,
    "本人への影響: 影響の有無は未確認。元アプリで確認が必要です。",
    "将来のリスク: 通知内容が事実なら期限や財産への影響があり得ます。",
    "推奨する次の一手: 通知内のリンクを開かず、元アプリを直接開いて確認する。",
    "根拠と鮮度: iPhoneで受信した通知。真偽と最新状態は未照合。"
  ].join("\n");
  return {message,reason:"high_risk"};
}
// The receipt map stores ONLY hashed keys + timestamps, never notification bodies.
function once(message) {
  if (!message) return "";
  if (typeof Keychain === "undefined") return message;
  const now = Date.now(), id = hash(message), seen = {};
  try {
    const s = Keychain.contains(RECEIPTS) ? JSON.parse(Keychain.get(RECEIPTS)) : {};
    if (s && typeof s === "object") for (const [k,v] of Object.entries(s)) {
      if (typeof v === "number" && now-v < SILENCE_MS && now-v >= 0) seen[k] = v;
    }
    if (seen[id] !== undefined) return "";
    seen[id] = now;
    Keychain.set(RECEIPTS, JSON.stringify(Object.fromEntries(Object.entries(seen).slice(-120))));
  } catch (_) { return ""; } // Fail silently rather than send repeats on storage failure.
  return message;
}
if (typeof Script !== "undefined" && typeof args !== "undefined") {
  let output = "";
  try { output = once(decision(args.shortcutParameter).message); } catch (_) {}
  Script.setShortcutOutput(output);
  Script.complete();
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {rawText,mask,decision,once,hash};
}
