/* Record only a returned native Shortcuts action, not proof of a changed iOS state.
   No network / Notion writes. Re-run and ambiguous receipts remain fail-closed. */
const FILE='YOS Clarity Device Pilot v4 Receipts.json';
function ack(){
  const arg=String(args.shortcutParameter??'');
  const m=/^inbox:(clarity:device4-[a-z0-9-]+):([0-9]{2})\|((?:start_timer)|(?:set_brightness))$/u.exec(arg);
  if(!m)return '操作結果記録：入力不正';
  const fm=FileManager.local(),path=fm.joinPath(fm.documentsDirectory(),FILE);
  if(!fm.fileExists(path))return '操作結果記録：原文台帳なし';
  let rows;try{rows=JSON.parse(fm.readString(path));}catch(_){return '操作結果記録：台帳読込み失敗';}
  const r=rows.find(x=>x.captureId===m[1]);const state=r?.items?.[m[2]];
  if(!r||!state||state.status!=='device_dispatching'||state.operation!==m[3])return '操作結果記録：対象不一致';
  state.status='device_action_returned';state.actionReturnedAt=Date.now();
  const expected=JSON.stringify(rows);
  fm.writeString(path,expected);
  if(fm.readString(path)!==expected)throw Error('ACK_READBACK_FAILED');
  return 'ショートカット操作アクション復帰を記録（iOS状態の検証は未実施）';
}
try{Script.setShortcutOutput(ack());}catch(_){Script.setShortcutOutput('操作結果記録：失敗・再実行禁止');}
Script.complete();
