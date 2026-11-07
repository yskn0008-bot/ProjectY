// Variables used by Scriptable.
// icon-color: blue; icon-glyph: calendar;
// YOS Calendar Sync v0.1 — safe read-only diagnostic. No writes or deletes.
// Uses the existing Notion integration token from Scriptable Keychain.
const DB='965c6086-32c1-463d-93b4-87a9cb69b3ad';
const KEY='YOS_NOTION_INTEGRATION_TOKEN';
const report=[];
try{
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(start);end.setDate(end.getDate()+1);
 const events=await CalendarEvent.between(start,end);
 report.push('Appleカレンダー：本日 '+events.length+'件（終日含む）');
 report.push('YOS連携印付き：'+events.filter(e=>String(e.notes||'').includes('YOS_TASK_ID:')).length+'件');
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
  const rows=data.results||[];
  report.push('YOS Tasks：先頭 '+rows.length+'件取得');
  report.push('期限設定済：'+rows.filter(x=>x.properties?.['期限']?.date?.start).length+'件');
  report.push('同期リンク設定済：'+rows.filter(x=>String(x.properties?.['連結先']?.rich_text?.map(z=>z.plain_text).join('')||'').startsWith('YOSCAL|')).length+'件');
  if(data.has_more)report.push('続きのページあり：全件取得は未対応');
 }catch(e){report.push('Notion取得不可：'+String(e.message||e))}
}
const a=new Alert();a.title='YOS 双方向同期｜接続診断';a.message=report.join('\n')+'\n\n診断専用です。予定・タスクは変更していません。';a.addAction('閉じる');await a.presentAlert();Script.complete();
