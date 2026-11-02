// YOS Notification Decision Filter v0.5 | Scriptable | no notification, network or Notion write.
// Shortcut input: ONLY the response from its existing GPT decision action.
// Shortcut output: a non-empty Japanese alert text only for a validated P0/P1 YOS_ALERT;
// otherwise an empty string. The Shortcut must display this OUTPUT under an IF-not-empty gate.
// Original app notifications and existing Notification Bridge must remain enabled.
function modelText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of ['response', 'modelResponse', 'text', 'content']) {
      if (typeof value[key] === 'string') return value[key];
    }
  }
  return '';
}
function safeText(value) {
  return String(value || '')
    .replace(/(?:password|パスワード|token|APIキー|secret)\s*[:：=]\s*\S+/gi, '[秘密非表示]')
    .replace(/(^|[^\d])(?:\d[\s-]?){12,27}\d(?=[^\d]|$)/g, '$1[長い番号非表示]')
    .replace(/\b0\d{9,10}\b/g, '[電話番号非表示]')
    .replace(/https?:\/\/\S+/gi, '[リンク非表示]')
    .replace(/[<>]/g, '')
    .trim();
}
function notificationText(modelResponse) {
  const message = modelText(modelResponse).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!message || message.length > 10000) return '';
  const lines = message.split('\n').map(line => line.trim()).filter(Boolean);
  // DO NOT use substring tests: untrusted original notifications may mention YOS_ALERT.
  if (lines[0] !== 'YOS_ALERT') return '';
  // Exact second-line priority and a single tag: text that merely mentions ALERT is not a command.
  if (!/^優先度\s*[:：]\s*P[01]\s*$/u.test(lines[1] || '')) return '';
  if (lines.slice(2).some(line => /^(?:優先度\s*[:：]|YOS_(?:ALERT|SILENT)(?:\b|$))/u.test(line))) return '';
  const priority = /P[01]/.exec(lines[1])[0];
  function field(name) {
    const prefix = new RegExp('^' + name + '\\s*[:：]\\s*', 'u');
    const line = lines.find(line => prefix.test(line));
    return line ? safeText(line.replace(prefix, '')) : '';
  }
  const fact = field('事実');
  const impact = field('本人への影響');
  const next = field('推奨する次の一手') || field('次の一手');
  const risk = field('将来のリスク');
  const basis = field('根拠と鮮度');
  if (!fact || !next || !basis) return '';
  // Never repeat authentication codes in a lock-screen notification.
  if (/認証コード|確認コード|ワンタイム|OTP|2FA|verification\s*code|security\s*code/iu.test(message)) return '';
  const summary = [
    '【YOS重要｜' + priority + '】',
    fact,
    impact && impact !== 'なし' ? '影響：' + impact : '',
    risk && risk !== 'なし' ? '注意：' + risk : '',
    '次の一手：' + next,
    '根拠：' + basis
  ].filter(Boolean).join('\n');
  return summary.slice(0,550);
}
// The Scriptable bridge has no side effects other than returning the validated string.
if (typeof Script !== 'undefined' && typeof args !== 'undefined') {
  Script.setShortcutOutput(notificationText(args.shortcutParameter));
  Script.complete();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { notificationText, safeText, modelText };
}
