// Variables used by Scriptable.
// icon-color: blue; icon-glyph: calendar;
// YOS Timeline Auto v1.3 — stable launcher, GitHub refresh, last-known-good fallback.
// Only the Timeline presentation is downloaded; never overwrites other Scriptable scripts.
const SOURCE="https://raw.githubusercontent.com/yskn0008-bot/ProjectY/main/ios-app/scriptable/YOS%20Timeline.js";
const fm=FileManager.local();
const folder=fm.joinPath(fm.documentsDirectory(),"YOS-Timeline-Cache");
if(!fm.fileExists(folder))fm.createDirectory(folder,true);
const current=fm.joinPath(folder,"current.html");
const previous=fm.joinPath(folder,"previous.html");
const meta=fm.joinPath(folder,"version.txt");
const backupMeta=fm.joinPath(folder,"previous-version.txt");
const extract=source=>{
  if(!/^\/\/ Variables used by Scriptable\./.test(source)||!source.includes("YOS Timeline v"))throw Error("不正な配布ファイル");
  const match=source.match(/const html=`([\s\S]*?)`;\s*await view\.loadHTML\(html\)/);
  if(!match)throw Error("未対応の配布形式");
  const html=match[1].replace(/<\\\/script>/g,"</script>");
  if(!html.startsWith("<!doctype html>")||!html.includes('id="tl"')||!html.includes('id="notice"')||!html.includes("</html>")||html.length<2000)throw Error("画面の検証に失敗");
  const version=(source.match(/YOS Timeline v([0-9.]+)/)||[])[1]||"unknown";
  return {html,version};
};
let latest=null,problem="";
try{
  const req=new Request(SOURCE);
  req.timeoutInterval=12;
  const source=await req.loadString();
  if(req.response?.statusCode!==200)throw Error("HTTP "+req.response?.statusCode);
  latest=extract(source);
}catch(e){problem=String(e.message||e)}
let candidate=latest?.html||(fm.fileExists(current)?fm.readString(current):null);
if(!candidate){
  const a=new Alert();a.title="YOS Timelineを起動できません";a.message="GitHub取得失敗・保存済み版なし。通信状態を確認してください。\n"+problem;a.addAction("OK");await a.presentAlert();Script.complete();
}else{
  const view=new WebView();
  // Read-only 7-day calendar bridge; midnight no longer hides tomorrow's scheduled tasks.
  let events=[],calendarError='';
  try{
    const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const last=new Date(today);last.setDate(last.getDate()+7);
    const records=await CalendarEvent.between(today,last);
    const dayKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    for(let day=0;day<7;day++){
      const start=new Date(today);start.setDate(start.getDate()+day);
      const end=new Date(today);end.setDate(end.getDate()+day+1);
      for(const e of records){
        if(e.isAllDay||e.endDate<=start||e.startDate>=end)continue;
        const a=Math.max(start.getTime(),e.startDate.getTime()),b=Math.min(end.getTime(),e.endDate.getTime());
        if(b>a)events.push({id:String(e.identifier||'')+':'+dayKey(start),date:dayKey(start),title:String(e.title||'予定').slice(0,100),start:Math.round((a-start.getTime())/60000),duration:Math.round((b-a)/60000)});
      }
    }
  }catch(e){calendarError=String(e.message||e);console.warn('Calendar read unavailable: '+calendarError);}
  const inject=html=>html.replace('<script>', '<script>window.YOS_CALENDAR_ERROR='+JSON.stringify(calendarError)+';window.YOS_CALENDAR_EVENTS='+JSON.stringify(events).replace(/</g,'\\u003c')+';'+'</scr'+'ipt><script>');
  try{
    await view.loadHTML(inject(candidate));
    if(latest&&(!fm.fileExists(current)||fm.readString(current)!==latest.html)){
      if(fm.fileExists(current)){
        fm.writeString(previous,fm.readString(current));
        if(fm.fileExists(meta))fm.writeString(backupMeta,fm.readString(meta));
      }
      fm.writeString(current,latest.html);
      fm.writeString(meta,latest.version);
    }
  }catch(e){
    const fallback=fm.fileExists(current)?fm.readString(current):(fm.fileExists(previous)?fm.readString(previous):null);
    if(!fallback||fallback===candidate)throw e;
    await view.loadHTML(inject(fallback));
    problem="更新版を読み込めず、保存済み版で起動";
  }
  if(problem)console.warn("YOS Timeline: "+problem);
  await view.present(true);
  Script.complete();
}
