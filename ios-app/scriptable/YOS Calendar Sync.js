// Variables used by Scriptable.
// icon-color: blue; icon-glyph: calendar;
// YOS Calendar Sync v0.6 — one-event confirmed writes; batch reconciliation preview is read-only.
// Uses the existing Notion integration token from Scriptable Keychain.
const DB='06e62efb-9a3c-45e2-bec7-7a53332c925a';
const KEY='YOS_NOTION_INTEGRATION_TOKEN';
const report=[];let calendarEvents=[];let notionRows=[];let fetchComplete=false;let calendarOK=false;
const stateOf=x=>x.properties?.['状態']?.status?.name||x.properties?.['状態']?.select?.name||'';
const inactive=x=>['完了','保留','キャンセル','中止','Done','Completed'].includes(stateOf(x));
const taskIdFromNotes=notes=>{const m=String(notes||'').match(/(?:^|\n)YOS_TASK_ID:([0-9a-f-]{36})(?:\n|$)/i);return m?m[1].toLowerCase():null};
const eventKey=e=>String(e.calendar?.identifier||'')+'|'+String(e.identifier||'');
const validRange=d=>{if(!d?.start?.includes('T')||!d?.end?.includes('T'))return false;const a=new Date(d.start),b=new Date(d.end);return Number.isFinite(+a)&&Number.isFinite(+b)&&b>a&&b-a<=86400000};
const inWindow=d=>{const a=new Date(d.start),now=new Date();return a>=now&&a<=new Date(now.getTime()+14*86400000)};
try{
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(start);end.setDate(end.getDate()+14);
 const events=await CalendarEvent.between(start,end);calendarEvents=events;calendarOK=true;
 report.push('Appleカレンダー：今後14日 '+events.length+'件（終日含む）');
 report.push('YOS連携印付き：'+events.filter(e=>taskIdFromNotes(e.notes)).length+'件');
}catch(e){report.push('カレンダー取得不可：'+String(e.message||e))}
if(!Keychain.contains(KEY)){
 report.push('Notion：既存Keychainトークンが見つかりません。');
}else{
 try{
  const req=new Request('https://api.notion.com/v1/databases/'+DB+'/query');
  req.method='POST';req.headers={'Authorization':'Bearer '+Keychain.get(KEY),'Notion-Version':'2022-06-28','Content-Type':'application/json'};
  req.body=JSON.stringify({page_size:100});
  const data=await req.loadJSON();
  if(!req.response||req.response.statusCode!==200)throw Error('HTTP '+req.response?.statusCode+' '+JSON.stringify(data).slice(0,150));
  let rows=data.results||[];let cursor=data.next_cursor;let pages=1;
  while(data.has_more&&cursor&&pages<30){req.body=JSON.stringify({page_size:100,start_cursor:cursor});const next=await req.loadJSON();if(req.response?.statusCode!==200)throw Error('追加ページ取得 HTTP '+req.response?.statusCode);rows.push(...(next.results||[]));cursor=next.next_cursor;data.has_more=next.has_more;pages++;}
  notionRows=rows;fetchComplete=!data.has_more;
  report.push('YOS Tasks：'+rows.length+'件取得（'+pages+'ページ）');
  report.push('期限設定済：'+rows.filter(x=>x.properties?.['期限']?.date?.start).length+'件');
  report.push('同期リンク設定済：'+rows.filter(x=>String(x.properties?.['連結先']?.rich_text?.map(z=>z.plain_text).join('')||'').startsWith('YOSCAL|')).length+'件');
  if(data.has_more)report.push('続きのページあり：安全上30ページで停止');
 }catch(e){report.push('Notion取得不可：'+String(e.message||e))}
}
if(notionRows.length&&calendarEvents.length){
 const ids=new Set(notionRows.map(x=>x.id.toLowerCase()));const linked=calendarEvents.filter(e=>taskIdFromNotes(e.notes));
 const orphans=linked.filter(e=>!ids.has(taskIdFromNotes(e.notes)));
 const countById={};for(const e of linked){const id=taskIdFromNotes(e.notes);countById[id]=(countById[id]||0)+1;}
 const duplicates=Object.values(countById).filter(n=>n>1).length;
 const scheduled=notionRows.filter(x=>x.properties?.['期限']?.date?.start&&!inactive(x));
 const noTime=scheduled.filter(x=>!x.properties?.['期限']?.date?.start?.includes('T'));
 report.push('--- 照合プレビュー ---');
 report.push('紐づき不明の予定：'+orphans.length+'件');
 report.push('同一タスクの重複予定：'+duplicates+'組');
 report.push('未完了・期限あり：'+scheduled.length+'件');
 report.push('開始時刻なし（日付のみ）：'+noTime.length+'件');
 const linkedIds=new Set(linked.map(e=>taskIdFromNotes(e.notes)));const eligible=notionRows.filter(x=>!inactive(x)&&validRange(x.properties?.['期限']?.date)&&inWindow(x.properties['期限'].date));
 const exportCandidates=eligible.filter(x=>!linkedIds.has(x.id.toLowerCase()));
 report.push('日時確定・未連携候補：'+exportCandidates.length+'件（作成は未実行）');
 report.push('照合はIDのみ。名前の一致では自動結合しません。');
}
// Unified 14-day display preview: Calendar wins for linked IDs; Notion contributes only unlinked timed tasks.
// This is a read-only reconciliation report, not an automatic synchronization.
if(fetchComplete&&calendarOK){
 const idCounts={};for(const e of calendarEvents){const id=taskIdFromNotes(e.notes);if(id)idCounts[id]=(idCounts[id]||0)+1;}
 const calendarIds=new Set(calendarEvents.map(e=>taskIdFromNotes(e.notes)).filter(Boolean));
 const notionTimed=notionRows.filter(x=>!inactive(x)&&validRange(x.properties?.['期限']?.date)&&inWindow(x.properties['期限'].date));
 const unlinked=notionTimed.filter(x=>!calendarIds.has(x.id.toLowerCase()));
 const conflictIds=new Set(Object.keys(idCounts).filter(id=>idCounts[id]>1));
 const linkedChanged=calendarEvents.filter(e=>{
  const id=taskIdFromNotes(e.notes);if(!id||conflictIds.has(id))return false;
  const task=notionRows.find(x=>x.id.toLowerCase()===id);
  if(!task||!validRange(task.properties?.['期限']?.date)||e.isAllDay)return false;
  const d=task.properties['期限'].date;
  return Math.abs(new Date(d.start)-e.startDate)>60000||Math.abs(new Date(d.end)-e.endDate)>60000;
 });
 report.push('--- 共通表示プレビュー（読み取り専用） ---');
 report.push('Apple予定：'+calendarEvents.length+'件（終日含む）');
 report.push('Notion日時付き・未連携：'+unlinked.length+'件');
 report.push('ID連携済みはApple側を表示し、Notion側の二重表示を抑止');
 report.push('日時不一致：'+linkedChanged.length+'件／重複ID：'+conflictIds.size+'組');
 if(conflictIds.size)report.push('重複IDは自動更新せず確認待ち');
 report.push('日付のみ・範囲外・取得失敗は統合表示対象外');
}
const a=new Alert();a.title='YOS 双方向同期｜接続診断';a.message=report.join('\n')+'\n\n既定は読み取り専用。同期対象は1件ずつ明示確認します。';a.addAction('閉じる');
if(fetchComplete&&calendarOK){a.addAction('日時付きタスクを1件だけ予定に追加');a.addAction('連携済み予定の変更をNotionに反映');a.addAction('一括同期の安全プレビュー（書き込みなし）');}
const choice=await a.presentAlert();
if(choice===1){
 const linkedIds=new Set(calendarEvents.map(e=>taskIdFromNotes(e.notes)).filter(Boolean));
 const candidates=notionRows.filter(x=>{
  const date=x.properties?.['期限']?.date, state=stateOf(x);
  return date?.start?.includes('T')&&date?.end?.includes('T')&&!linkedIds.has(x.id.toLowerCase())&&!inactive(x);
 }).filter(x=>{const d=x.properties['期限'].date;const start=new Date(d.start),end=new Date(d.end);return Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())&&end>start&&end-start<=86400000&&start>=new Date()&&start<=new Date(Date.now()+14*86400000)});
 if(!candidates.length){const n=new Alert();n.title='追加候補なし';n.message='今後14日間で開始・終了時刻が両方設定された未完了タスクはありません。日付のみのタスクには勝手に時刻を設定しません。';n.addAction('OK');await n.presentAlert();}
 else{
  const pick=new Alert();pick.title='追加するタスクを選択';pick.message='1件だけ追加します。既存予定は変更しません。';
  for(const x of candidates.slice(0,10))pick.addAction((x.properties['やること']?.title?.map(y=>y.plain_text).join('')||'タスク').slice(0,45));
  pick.addCancelAction('キャンセル');
  const index=await pick.presentAlert();
  if(index>=0&&index<Math.min(candidates.length,10)){
   const x=candidates[index],d=x.properties['期限'].date;
   const title=x.properties['やること']?.title?.map(y=>y.plain_text).join('')||'YOS Task';
   const calendars=await Calendar.forEvents();
   const calPick=new Alert();calPick.title='保存先カレンダー';calPick.message='書き込み可能なカレンダーを選択。作成前にもう一度確認します。';
   const writable=calendars.filter(c=>c.allowsContentModifications!==false);
   for(const c of writable)calPick.addAction(c.title);
   calPick.addCancelAction('キャンセル');
   const ci=await calPick.presentAlert();
   if(ci>=0&&ci<writable.length){
    const cal=writable[ci],confirm=new Alert();
    confirm.title='予定を1件作成しますか？';
    confirm.message=title+'\n'+d.start+' ～ '+d.end+'\n保存先：'+cal.title+'\n\nNotionは変更しません。作成した予定にはタスクIDを記録します。';
    confirm.addDestructiveAction('1件作成');confirm.addCancelAction('中止');
    if(await confirm.presentAlert()===0){
     try{
      // Re-read immediately to avoid duplicating a linked event on repeated runs.
      const existing=await CalendarEvent.between(new Date(d.start),new Date(d.end));
      if(existing.some(e=>taskIdFromNotes(e.notes)===x.id.toLowerCase()))throw Error('同じタスクIDの予定が既に存在します');
      const event=new CalendarEvent();event.title=title;event.startDate=new Date(d.start);event.endDate=new Date(d.end);event.calendar=cal;
      event.notes='YOS_TASK_ID:'+x.id.toLowerCase()+'\nYOS_SYNC_SOURCE:NOTION\nNotion: https://www.notion.so/'+x.id.replace(/-/g,'');
      await event.save();
      const done=new Alert();done.title='1件作成しました';done.message='Appleカレンダーに追加済み。逆方向の反映は別操作で1件ずつ確認できます。';done.addAction('OK');await done.presentAlert();
     }catch(e){const err=new Alert();err.title='作成できませんでした';err.message=String(e.message||e);err.addAction('OK');await err.presentAlert();}
    }
   }
  }
 }
}
if(choice===2){
 const ids=new Map(notionRows.map(x=>[x.id.toLowerCase(),x]));
 const counts={};for(const e of calendarEvents){const id=taskIdFromNotes(e.notes);if(id)counts[id]=(counts[id]||0)+1;}
 const pad=n=>String(n).padStart(2,'0');
 const localISO=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':00'+(d.getTimezoneOffset()<=0?'+':'-')+pad(Math.floor(Math.abs(d.getTimezoneOffset())/60))+':'+pad(Math.abs(d.getTimezoneOffset())%60);
 const candidates=calendarEvents.filter(e=>{
  const id=taskIdFromNotes(e.notes),task=id&&ids.get(id);
  return task&&counts[id]===1&&!e.isAllDay&&e.startDate instanceof Date&&e.endDate instanceof Date&&e.endDate>e.startDate&&e.endDate-e.startDate<=86400000&&!inactive(task)&&task.properties?.['期限']?.date?.start?.includes('T')&&task.properties?.['期限']?.date?.end?.includes('T');
 }).filter(e=>{const d=ids.get(taskIdFromNotes(e.notes)).properties['期限'].date;return Math.abs(new Date(d.start)-e.startDate)>60000||Math.abs(new Date(d.end)-e.endDate)>60000;});
 if(!candidates.length){const n=new Alert();n.title='反映候補なし';n.message='連携ID付きで、開始・終了時刻が変わった予定は見つかりません。既存の一般予定は対象外です。';n.addAction('閉じる');await n.presentAlert();}
 else{
  const p=new Alert();p.title='変更を反映する予定';p.message='変更候補 '+candidates.length+'件。1件ずつ選択して確認します。';for(const e of candidates.slice(0,10))p.addAction(String(e.title).slice(0,45));p.addCancelAction('キャンセル');
  const i=await p.presentAlert();
  if(i>=0&&i<Math.min(candidates.length,10)){
   const e=candidates[i],id=taskIdFromNotes(e.notes),task=ids.get(id),old=task.properties['期限'].date;
   const c=new Alert();c.title='Notionの期限を変更しますか？';c.message='タスク：'+(task.properties['やること']?.title?.map(z=>z.plain_text).join('')||id)+'\n現在：'+old.start+' ～ '+old.end+'\n変更：'+localISO(e.startDate)+' ～ '+localISO(e.endDate)+'\n\nこの1件の期限のみ変更。削除はしません。';c.addAction('変更する');c.addCancelAction('キャンセル');
   if(await c.presentAlert()===0){
    try{
     // Re-read Notion to reject edits made since the snapshot.
     const get=new Request('https://api.notion.com/v1/pages/'+id);get.method='GET';get.headers={'Authorization':'Bearer '+Keychain.get(KEY),'Notion-Version':'2022-06-28'};
     const latest=await get.loadJSON();if(get.response?.statusCode!==200)throw Error('Notion再取得 HTTP '+get.response?.statusCode);
     const current=latest.properties?.['期限']?.date;
     if(inactive(latest))throw Error('タスクが完了・保留に変更されたため中止しました');
     if(current?.start!==old.start||current?.end!==old.end)throw Error('Notion側も変更されています。競合のため中止しました');
     const nowEvents=await CalendarEvent.between(e.startDate,e.endDate);
     const matches=nowEvents.filter(z=>taskIdFromNotes(z.notes)===id);
     if(matches.length!==1||matches[0].startDate.getTime()!==e.startDate.getTime()||matches[0].endDate.getTime()!==e.endDate.getTime())throw Error('カレンダー側の予定が変更・重複したため中止しました');
     const patch=new Request('https://api.notion.com/v1/pages/'+id);patch.method='PATCH';patch.headers={'Authorization':'Bearer '+Keychain.get(KEY),'Notion-Version':'2022-06-28','Content-Type':'application/json'};
     patch.body=JSON.stringify({properties:{'期限':{date:{start:localISO(e.startDate),end:localISO(e.endDate)}}}});
     const result=await patch.loadJSON();if(patch.response?.statusCode!==200)throw Error('Notion更新 HTTP '+patch.response?.statusCode+' '+JSON.stringify(result).slice(0,140));
     const done=new Alert();done.title='Notionに反映しました';done.message='1件の期限を更新しました。カレンダー側の予定は変更していません。';done.addAction('閉じる');await done.presentAlert();
    }catch(err){const fail=new Alert();fail.title='反映を中止しました';fail.message=String(err.message||err);fail.addAction('閉じる');await fail.presentAlert();}
   }
  }
 }
}
if(choice===3){
 const byId=new Map(notionRows.map(x=>[x.id.toLowerCase(),x]));
 const linked=calendarEvents.filter(e=>taskIdFromNotes(e.notes));
 const counts={};for(const e of linked){const id=taskIdFromNotes(e.notes);counts[id]=(counts[id]||0)+1;}
 const dupIds=new Set(Object.keys(counts).filter(id=>counts[id]>1));
 const missing=linked.filter(e=>!byId.has(taskIdFromNotes(e.notes)));
 const pending=notionRows.filter(x=>!inactive(x)&&validRange(x.properties?.['期限']?.date)&&inWindow(x.properties['期限'].date)&&!counts[x.id.toLowerCase()]);
 const changed=linked.filter(e=>{const id=taskIdFromNotes(e.notes),x=byId.get(id);if(!x||dupIds.has(id)||e.isAllDay||!validRange(x.properties?.['期限']?.date))return false;const d=x.properties['期限'].date;return Math.abs(new Date(d.start)-e.startDate)>60000||Math.abs(new Date(d.end)-e.endDate)>60000;});
 const p=new Alert();p.title='一括同期｜安全プレビュー';p.message='新規作成候補：'+pending.length+'件\nカレンダー側の日時変更：'+changed.length+'件\n重複リンク：'+dupIds.size+'組\n紐づき先不明：'+missing.length+'件\n\n現在は一覧確認のみ。日時が異なる場合、どちらが新しい変更かは判定できないため一括上書きしません。\n予定・タスクの変更は0件です。';p.addAction('閉じる');await p.presentAlert();
}
Script.complete();
