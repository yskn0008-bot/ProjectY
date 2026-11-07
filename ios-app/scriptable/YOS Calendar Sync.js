// Variables used by Scriptable.
// icon-color: blue; icon-glyph: calendar;
// YOS Calendar Sync v0.3 — guarded one-event calendar export. No writes or deletes.
// Uses the existing Notion integration token from Scriptable Keychain.
const DB='06e62efb-9a3c-45e2-bec7-7a53332c925a';
const KEY='YOS_NOTION_INTEGRATION_TOKEN';
const report=[];let calendarEvents=[];let notionRows=[];let fetchComplete=false;let calendarOK=false;
const taskIdFromNotes=notes=>{const m=String(notes||'').match(/(?:^|\n)YOS_TASK_ID:([0-9a-f-]{36})(?:\n|$)/i);return m?m[1].toLowerCase():null};
const eventKey=e=>String(e.calendar?.identifier||'')+'|'+String(e.identifier||'');
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
 const scheduled=notionRows.filter(x=>x.properties?.['期限']?.date?.start&&x.properties?.['状態']?.select?.name!=='完了');
 const noTime=scheduled.filter(x=>!x.properties?.['期限']?.date?.start?.includes('T'));
 report.push('--- 照合プレビュー ---');
 report.push('紐づき不明の予定：'+orphans.length+'件');
 report.push('同一タスクの重複予定：'+duplicates+'組');
 report.push('未完了・期限あり：'+scheduled.length+'件');
 report.push('開始時刻なし（日付のみ）：'+noTime.length+'件');
 report.push('自動作成候補：0件（時刻未確定は作成禁止）');
 report.push('照合はIDのみ。名前の一致では自動結合しません。');
}
const a=new Alert();a.title='YOS 双方向同期｜接続診断';a.message=report.join('\n')+'\n\n既定は読み取り専用。同期対象は1件ずつ明示確認します。';a.addAction('閉じる');
if(fetchComplete&&calendarOK)a.addAction('日時付きタスクを1件だけ予定に追加');
const choice=await a.presentAlert();
if(choice===1){
 const linkedIds=new Set(calendarEvents.map(e=>taskIdFromNotes(e.notes)).filter(Boolean));
 const candidates=notionRows.filter(x=>{
  const date=x.properties?.['期限']?.date, state=x.properties?.['状態']?.select?.name;
  return date?.start?.includes('T')&&date?.end?.includes('T')&&!linkedIds.has(x.id.toLowerCase())&&state!=='完了'&&state!=='保留';
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
      const done=new Alert();done.title='1件作成しました';done.message='Appleカレンダーに追加済み。Notionへの逆方向同期は未実装です。';done.addAction('OK');await done.presentAlert();
     }catch(e){const err=new Alert();err.title='作成できませんでした';err.message=String(e.message||e);err.addAction('OK');await err.presentAlert();}
    }
   }
  }
 }
}
Script.complete();
