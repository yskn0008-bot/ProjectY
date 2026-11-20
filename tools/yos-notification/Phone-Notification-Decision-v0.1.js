// YOS phone notification decision v0.1 — pure, no network or device access.
// Input must be obtained lawfully by the existing iPhone notification pipeline.
// No lookup, voicemail access, contact matching or notifications occur in this file.
function decidePhoneNotification(event) {
  if (!event || event.kind !== "missed_call") return {notify:false, reason:"not_missed_call"};
  const voicemail = event.voicemail || {};
  // voicemail.present must be true only when the source confirms a message exists.
  if (voicemail.present === true) {
    const transcript = typeof voicemail.transcript === "string" ? voicemail.transcript.trim() : "";
    return {
      notify:true, reason:"voicemail",
      title:"YOS｜留守電",
      body:(event.contactName || event.displayNumber || "発信者不明") +
        (transcript ? "："+transcript : "：留守電あり（内容は取得できません）")
    };
  }
  // Unknown voicemail state is NOT treated as confirmed absence.
  if (voicemail.present !== false) return {notify:false,reason:"voicemail_status_unknown",pending:true};
  if (event.isSavedContact === true) return {notify:false,reason:"known_contact_no_voicemail"};
  if (event.isSavedContact !== false) return {notify:false,reason:"contact_status_unknown",pending:true};
  const match = event.lookup || {};
  // A generic search hit, spam report or partial-number match is not enough.
  if (match.exactNumberMatch === true && typeof match.name === "string" && match.name.trim() &&
      (match.sourceType === "official" || match.sourceType === "public_directory")) {
    return {notify:true,reason:"unknown_number_identified",title:"YOS｜不在着信",
      body:match.name.trim()+"（公開情報による候補・発信者本人は未確認）"};
  }
  if (match.status === "pending") return {notify:false,reason:"lookup_pending",pending:true};
  return {notify:false,reason:"unknown_number_not_identified"};
}
// Use the original Phone notification as the archive source. This does not query iOS Call History.
// "Needs review" is not the same as "urgent" or "call back immediately".
function missedCallArchive(event) {
  if (!event || event.kind !== "missed_call") return null;
  const display = typeof event.contactName==="string" && event.contactName.trim()
    ? event.contactName.trim().slice(0,80) : "発信者未確認";
  const when = typeof event.time==="string" && !Number.isNaN(Date.parse(event.time)) ? event.time : null;
  const voicemail = event.voicemail?.present===true ? "あり" :
    event.voicemail?.present===false ? "なし" : "未確認";
  return {
    kind:"missed-call",
    source:"iPhone通知（着信履歴を直接取得していない）",
    displayName:display,
    time:when,
    voicemailStatus:voicemail,
    reviewStatus:"未確認",
    handled:false,
    note:"折り返しが必要か電話アプリと本人の状況で確認。電話番号・折り返し済み・通話内容は推測しない。"
  };
}
if (typeof module !== "undefined") module.exports = {decidePhoneNotification,missedCallArchive};
