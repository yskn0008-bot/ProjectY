// Variables used by Scriptable.
// icon-color: blue; icon-glyph: calendar;
// YOS Calendar Sync v0.2 — safe read-only reconciliation preview. No writes or deletes.
// Uses the existing Notion integration token from Scriptable Keychain.
const DB='06e62efb-9a3c-45e2-bec7-7a53332c925a';
const KEY='YOS_NOTION_INTEGRATION_TOKEN';
const report=[];let calendarEvents=[];let notionRows=[];
const taskIdFromNotes=notes=>{const m=String(notes||'').match(/(?:^|\n)YOS_TASK_ID:([0-9a-f-]{36})(?:\n|$)/i);return m?m[1].toLowerCase():null};
const eventKey=e=>String(e.calendar?.identifier||'')+'|'+String(e.identifier||'');
try{
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(start);end.setDate(end.getDate()+14);
 const events=await CalendarEvent.between(start,end);calendarEvents=events;
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
  notionRows=rows;
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
const a=new Alert();a.title='YOS 双方向同期｜接続診断';a.message=report.join('\n')+'\n\n照合プレビューのみ。予定・タスクは変更していません。';a.addAction('閉じる');await a.presentAlert();Script.complete();
