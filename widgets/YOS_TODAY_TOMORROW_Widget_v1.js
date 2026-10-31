// YOS TODAY / TOMORROW v1 — large Scriptable widget.
// Read-only. No automatic notifications, no new data store, no fake Health values.
// Widget size: Large. Parameter: AUTO (default), DAY, NIGHT.
(async function () {
  const SETTINGS = {
    mode: String(args.widgetParameter || "AUTO").trim().toUpperCase(),
    eveningHour: 19,
    refreshMinutes: 15,
    feedUrl: "https://project-y-yos-ai.vercel.app/api/yos/widget",
    tokenKey: "MY_WAY_WIDGET_TOKEN",
    feedCache: "my-way-now-widget-cache-v1.json",
    healthFile: "YOS/Today/health-summary.json"
  };
  const URL = {
    home: "https://www.notion.so/3ed5ca882895819aaa57c139ea36fe2b",
    tasks: "https://www.notion.so/06e62efb9a3c45e2bec77a53332c925a",
    life: "https://yskn0008-bot.github.io/ProjectY/life/",
    alerts: "https://www.notion.so/3fa5ca88289581d399cece2fb6e87c2d"
  };
  const C = {
    paper: "#FAF7F0", ink: "#263C38", soft: "#64756D", gold: "#9B7335",
    line: "#DDD5C6", blue: "#3C7F9B", green: "#527F69", coral: "#B36556",
    orange: "#F0DDBA", white: "#FFFFFF"
  };
  const fm = FileManager.local();
  const cloud = FileManager.iCloud();
  const now = new Date();
  const dayMode = SETTINGS.mode === "DAY" || SETTINGS.mode === "TODAY";
  const nightMode = SETTINGS.mode === "NIGHT" || SETTINGS.mode === "TOMORROW";
  const night = nightMode || (!dayMode && now.getHours() >= SETTINGS.eveningHour);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const target = night ? tomorrow : now;
  const dateKey = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
  const targetKey = dateKey(target);
  const todayKey = dateKey(now);
  const clean = (value, limit=80) => String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0,limit);
  const validDate = value => { const d = new Date(value); return isNaN(d.getTime()) ? null : d; };
  const time = d => String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  const dateText = d => (d.getMonth()+1)+"/"+d.getDate()+"（"+"日月火水木金土"[d.getDay()]+"）";
  const urlForCalendar = d => "calshow:" + Math.floor(d.getTime()/1000);
  function colour(hex) { return new Color(hex); }
  function label(box, value, size, hex, bold, lines=1) {
    const item = box.addText(clean(value, 220));
    item.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
    item.textColor = colour(hex);
    item.lineLimit = lines;
    item.minimumScaleFactor = 0.90;
    return item;
  }
  function section(widget, icon, title, value, link, accent) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.setPadding(4,0,4,0);
    if(link) row.url = link;
    const sym = SFSymbol.named(icon);
    sym.applyFont(Font.systemFont(14));
    const img = row.addImage(sym.image);
    img.imageSize = new Size(14,14);
    img.tintColor = colour(accent || C.gold);
    row.addSpacer(8);
    const content = row.addStack();
    content.layoutVertically();
    label(content,title,13,C.soft,true);
    content.addSpacer(2);
    label(content,value,16,C.ink,true,2);
    row.addSpacer();
    const chevron = SFSymbol.named("chevron.right");
    chevron.applyFont(Font.systemFont(9));
    const arrow = row.addImage(chevron.image);
    arrow.imageSize = new Size(8,10);
    arrow.tintColor = colour(C.soft);
    return row;
  }
  function separator(widget) {
    widget.addSpacer(3);
    const bar = widget.addStack();
    bar.size = new Size(0,1);
    bar.backgroundColor = colour(C.line);
    widget.addSpacer(4);
  }
  async function readCalendar(d) {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start.getFullYear(),start.getMonth(),start.getDate()+1);
    try {
      const list = await CalendarEvent.between(start,end);
      const items = list.filter(e => e && e.title && (e.isAllDay || (validDate(e.endDate || e.startDate) || end) >= (night ? start : now)))
        .sort((a,b) => (a.isAllDay ? -1 : b.isAllDay ? 1 : (+new Date(a.startDate)-+new Date(b.startDate))))
        .slice(0,10);
      return {ok:true, items};
    } catch(e) { return {ok:false,items:[]}; }
  }
  async function readReminders() {
    try {
      const items = (await Reminder.allIncomplete()).filter(r => r && r.title);
      items.sort((a,b) => (a.isOverdue ? -1 : b.isOverdue ? 1 : 0) ||
        ((a.dueDate ? +new Date(a.dueDate) : Infinity) - (b.dueDate ? +new Date(b.dueDate) : Infinity)));
      return {ok:true,items};
    } catch(e) { return {ok:false,items:[]}; }
  }
  function relevantReminder(reminders, targetKey, night) {
    const list = reminders.items.filter(r => {
      if (!r.dueDate) return false;
      const key = dateKey(new Date(r.dueDate));
      return night ? key <= targetKey : key <= todayKey;
    });
    return list.slice(0,3);
  }
  function reminderLabel(reminders) {
    if (!reminders.ok) return "リマインダー未取得";
    const matches = relevantReminder(reminders,targetKey,night);
    if (!matches.length) return night ? "明日までの未完了なし" : "期限付きの未完了なし";
    const r = matches[0];
    const overdue = r.dueDate && dateKey(new Date(r.dueDate)) < todayKey;
    return (overdue ? "期限超過｜" : "") + clean(r.title,33) + (matches.length>1 ? " ほか"+(matches.length-1)+"件" : "");
  }
  async function readYosFeed() {
    let cached = null;
    try {
      const path = fm.joinPath(fm.documentsDirectory(), SETTINGS.feedCache);
      if(fm.fileExists(path)) cached = JSON.parse(fm.readString(path));
    } catch(e) {}
    if(Keychain.contains(SETTINGS.tokenKey)){
      try {
        const token = Keychain.get(SETTINGS.tokenKey);
        if(token) {
          const req = new Request(SETTINGS.feedUrl);
          req.headers = {Authorization:"Bearer "+token,Accept:"application/json"};
          req.timeoutInterval = 7;
          const data = await req.loadJSON();
          if(Number(req.response && req.response.statusCode)===200 && data && typeof data==="object")
            return {data, stale:false};
        }
      } catch(e) {}
    }
    const age = cached && Number(cached.savedAt) ? Date.now()-Number(cached.savedAt) : Infinity;
    if(age>=0 && age<6*3600000 && cached.data) return {data:cached.data,stale:true};
    return {data:null,stale:true};
  }
  function yosTask(feed) {
    const data = feed.data || {};
    const tasks = Array.isArray(data.tasks) ? data.tasks : (data.task ? [data.task] : []);
    const item = tasks.find(t => t && clean(t.title));
    if(!item) return feed.data ? "現在の優先タスクなし" : "YOS Tasks未接続";
    return (feed.stale ? "前回｜" : "") + clean(item.title,35).replace(/^\d{1,3}\s*[｜|]\s*/,"");
  }
  async function readHealth() {
    try {
      const path=cloud.joinPath(cloud.documentsDirectory(),SETTINGS.healthFile);
      if(!cloud.fileExists(path)) return null;
      if(cloud.isFileStoredIniCloud(path)) await cloud.downloadFileFromiCloud(path);
      const data=JSON.parse(cloud.readString(path));
      if(!data || data.date !== todayKey) return null;
      const steps=Number(data.steps);
      const sleep=Number(data.sleepHours);
      const walk=Number(data.activityMinutes);
      const parts=[];
      if(data.steps!==null && data.steps!==undefined && Number.isFinite(steps) && steps>=0 && steps<150000)
        parts.push("歩数 "+Math.round(steps).toLocaleString("ja-JP"));
      if(data.sleepHours!==null && data.sleepHours!==undefined && Number.isFinite(sleep) && sleep>=0 && sleep<=24)
        parts.push("睡眠 "+sleep.toFixed(1)+"h");
      if(data.activityMinutes!==null && data.activityMinutes!==undefined && Number.isFinite(walk) && walk>=0 && walk<1440)
        parts.push("活動 "+Math.round(walk)+"分");
      return parts.slice(0,2).join(" · ") || null;
    } catch(e) { return null; }
  }
  function calendarLabel(result) {
    if(!result.ok) return "カレンダー未取得";
    if(!result.items.length) return night ? "明日の予定なし" : "残りの予定なし";
    const e=result.items[0];
    return (e.isAllDay ? "終日 " : time(new Date(e.startDate))+" ") + clean(e.title,38) +
      (result.items.length>1 ? " ほか"+(result.items.length-1)+"件" : "");
  }
  function routineLabel(reminders) {
    if(night) return "MY LIFEで明朝の習慣を確認";
    if(!reminders.ok) return "記録を確認できません";
    const routine = reminders.items.filter(r => {
      const listName = clean(r.calendar && r.calendar.title,60);
      return /ルーティン|習慣|routine/i.test(listName);
    }).filter(r => !r.dueDate || dateKey(new Date(r.dueDate))<=targetKey);
    if(routine.length) return "未完了 "+routine.length+"件（リマインダー）";
    return "MY LIFEの実施記録を確認";
  }
  function preparationLabel(events,reminders) {
    const first = events.items.length ? events.items[0] : null;
    if(first) return "「"+clean(first.title,24)+"」に必要なものを確認";
    if(reminders.ok) {
      const due = relevantReminder(reminders,targetKey,true);
      if(due.length) return "「"+clean(due[0].title,25)+"」の対応を準備";
    }
    if(!events.ok || !reminders.ok) return "明日の予定・期限を取得できません";
    return "明日に必要な予定・期限は未登録";
  }
  const [events,reminders,feed,health] = await Promise.all([
    readCalendar(target),readReminders(),night?Promise.resolve({data:null,stale:true}):readYosFeed(),readHealth()
  ]);
  const widget = new ListWidget();
  widget.url = URL.home;
  widget.refreshAfterDate = new Date(Date.now()+SETTINGS.refreshMinutes*60000);
  widget.setPadding(15,17,14,17);
  const gradient = new LinearGradient();
  gradient.colors=[colour(C.paper),colour(C.white)];
  gradient.locations=[0,1];
  gradient.startPoint=new Point(0,0);
  gradient.endPoint=new Point(1,1);
  widget.backgroundGradient=gradient;
  const header=widget.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  const sun=SFSymbol.named(night ? "moon.stars.fill":"sun.max.fill");
  sun.applyFont(Font.systemFont(20));
  const sunImage=header.addImage(sun.image);
  sunImage.tintColor=colour(C.gold);
  sunImage.imageSize=new Size(20,20);
  header.addSpacer(8);
  label(header,night?"YOS TOMORROW":"YOS TODAY",19,C.ink,true);
  header.addSpacer();
  label(header,dateText(target),13,C.soft,false);
  widget.addSpacer(6);
  label(widget,night?"明日のために、今夜できること":"今日、必要なことだけ",13,C.gold,true);
  separator(widget);
  section(widget,"calendar",night?"明日の予定":"次の予定",calendarLabel(events),
    events.items.length ? urlForCalendar(new Date(events.items[0].startDate)):URL.home,C.blue);
  separator(widget);
  section(widget,"checkmark.circle",night?"期限・持ち越し":"今日のリマインダー",reminderLabel(reminders),
    URL.home,C.green);
  separator(widget);
  section(widget,"list.bullet.rectangle",night?"今夜の準備":"YOSの優先タスク",
    night?preparationLabel(events,reminders):yosTask(feed),night?URL.home:URL.tasks,C.gold);
  separator(widget);
  section(widget,"arrow.triangle.2.circlepath",night?"明朝のルーティン":"ルーティン",routineLabel(reminders),
    URL.life,C.green);
  separator(widget);
  section(widget,"heart",night?"今日の健康・休息":"ヘルスケア",
    health || "ヘルスケア未連携（実測値のみ表示）",URL.life,C.coral);
  widget.addSpacer();
  const footer=widget.addStack();
  footer.layoutHorizontally();
  label(footer,night?"夜の準備モード":"今日の情報モード",12,C.soft,false);
  footer.addSpacer();
  const alert=label(footer,"要対応を見る  ›",12,C.gold,true);
  footer.url=URL.alerts;

  // Full-screen life board reuses the SAME read-only sources as the large widget.
  // It only appears when this Scriptable entry is opened in the app, not from a widget refresh.
  async function presentLifeBoard(){
    const escapeHtml = value => String(value == null ? "" : value)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
    const safe = value => escapeHtml(clean(value,240));
    const feedItems = feed.data && Array.isArray(feed.data.tasks) ? feed.data.tasks : [];
    const priorities = feedItems.filter(t => t && clean(t.title)).slice(0,3);
    const focus = priorities[0] ? clean(priorities[0].title,110).replace(/^\d{1,3}\s*[｜|]\s*/,"") :
      (feed.data ? "重要なタスクは未登録" : "YOS Tasksは未取得");
    const cards = priorities.length ? priorities.map((t,i) => 
      '<div class="task"><div class="num">'+(i+1)+'</div><div class="grow"><b>'+safe(t.title)+'</b>'+
      (t.due ? '<small>期限 '+safe(t.due.slice(0,10))+'</small>' : '')+
      (t.nextAction ? '<small>'+safe(t.nextAction)+'</small>' : '')+'</div></div>'
    ).join("") : '<p class="muted">タスクの確認が必要です。取得できていない情報は表示しません。</p>';
    const eventRows = events.ok ?
      (events.items.length ? events.items.map(e => '<div class="event"><time>'+
        (e.isAllDay ? '終日' : escapeHtml(time(new Date(e.startDate))))+
        '</time><div><b>'+safe(e.title)+'</b>'+
        (e.location ? '<small>'+safe(e.location)+'</small>' : '')+'</div></div>').join("") :
        '<p class="muted">登録された予定はありません。空き時間が確定したわけではありません。</p>') :
        '<p class="muted">Appleカレンダー未取得。予定は確認できていません。</p>';
    const routine = reminders.ok ? reminders.items.filter(r => 
      /ルーティン|習慣|routine/i.test(clean(r.calendar && r.calendar.title,60))
    ).slice(0,4) : [];
    const habitRows = routine.length ? routine.map(r =>
      '<div class="habit"><span class="dot"></span>'+safe(r.title)+'</div>').join("") :
      '<p class="muted">習慣の実施状況は未連携です。未記録を未実施とは判定しません。</p>';
    const monday = new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));
    const nextMonday = new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+7);
    let weekEvents = null;
    try { weekEvents = await CalendarEvent.between(monday,nextMonday); }
    catch(e) { weekEvents = null; }
    const weekRows = weekEvents === null ?
      '<p class="muted">カレンダー未取得。今週の予定は確認できません。</p>' :
      Array.from({length:7},(_,i) => {
        const d=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i);
        const start=new Date(d.getFullYear(),d.getMonth(),d.getDate());
        const end=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);
        const dayEvents=weekEvents.filter(e => e && e.title && new Date(e.startDate)<end &&
          new Date(e.endDate || e.startDate)>start).sort((a,b)=>new Date(a.startDate)-new Date(b.startDate));
        return '<div class="weekrow"><div class="weekday">'+escapeHtml(dateText(d))+'</div><div class="grow">'+
          (dayEvents.length ? dayEvents.slice(0,3).map(e =>
            '<div class="weekevent">'+(e.isAllDay?'終日':escapeHtml(time(new Date(e.startDate))))+' '+safe(e.title)+'</div>'
          ).join("")+(dayEvents.length>3?'<small>ほか'+(dayEvents.length-3)+'件</small>':'') :
          '<span class="muted">予定の登録なし</span>')+'</div></div>';
      }).join("");
    const styles = [
      '*{box-sizing:border-box}body{margin:0;background:#F5F5F2;color:#252C2A;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;font-size:16px}',
      '.wrap{max-width:640px;margin:auto;padding:24px 18px 80px}.eyebrow{font-size:15px;letter-spacing:.10em;font-weight:800;color:#53665C}',
      'h1{font-size:35px;letter-spacing:-.04em;margin:6px 0 8px}.sub{font-size:17px;color:#515C56}',
      '.tabs{display:flex;gap:6px;border-radius:14px;background:#E7EAE6;padding:5px;margin:22px 0 18px}',
      '.tabs button{width:50%;min-height:48px;border:0;border-radius:10px;padding:13px;font-size:18px;font-weight:750;background:transparent;color:#46554C}',
      'body[data-tab=today] #tabToday,body[data-tab=week] #tabWeek{background:#fff;color:#253A33;box-shadow:0 2px 10px #18221C12}',
      'body[data-tab=today] .week,body[data-tab=week] .today{display:none}',
      '.hero{background:linear-gradient(130deg,#FCE6C6,#E5F1E8);color:#263B33;border:1px solid #E9DDD0;border-radius:20px;padding:24px 21px;margin-bottom:18px}',
      '.hero span{font-size:16px;font-weight:700;color:#566A5C}.hero h2{font-size:27px;line-height:1.45;margin:11px 0}.hero p{font-size:16px;color:#566258;line-height:1.55;margin:0}',
      '.section{background:white;border:1px solid #DFE5DD;border-radius:18px;padding:21px 18px;margin:14px 0;box-shadow:0 2px 7px #18221C08}.today .section:nth-of-type(2){border-left:5px solid #609BB7}.today .section:nth-of-type(3){border-left:5px solid #C79A54}.today .section:nth-of-type(4){border-left:5px solid #6F9E80}.today .section:nth-of-type(5){border-left:5px solid #B5A0C7}',
      'h3{margin:0 0 15px;font-size:22px;letter-spacing:-.02em}.sectionhead{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}',
      '.tag{color:#516B5C;font-size:15px;font-weight:700}.muted{color:#5D6961;font-size:17px;line-height:1.65;margin:7px 0}',
      '.event,.task,.weekrow{display:flex;gap:14px;padding:15px 0;border-top:1px solid #EAEEE8}.event:first-of-type,.task:first-of-type{border-top:0}',
      '.event time{width:58px;flex-shrink:0;font-size:18px;color:#206D90;font-weight:800}.event b,.task b{display:block;font-size:19px;line-height:1.5}',
      '.event small,.task small{display:block;color:#5D6B61;margin-top:6px;line-height:1.55;font-size:16px}',
      '.grow{flex:1;min-width:0;overflow-wrap:anywhere}.num{background:#F3E9DB;color:#87571F;border-radius:10px;width:33px;height:33px;display:grid;place-items:center;flex-shrink:0;font-weight:800}',
      '.habit{padding:12px 0;font-size:19px;line-height:1.5}.dot{display:inline-block;width:11px;height:11px;border:2px solid #6D9A85;border-radius:50%;margin-right:12px}',
      '.weekrow{align-items:start}.weekday{width:80px;font-size:17px;font-weight:800;flex-shrink:0}.weekevent{font-size:17px;margin-bottom:9px;line-height:1.5}',
      '.foot{color:#58665D;font-size:14px;line-height:1.7;padding:12px 3px}',
      '.links{display:flex;gap:8px;flex-wrap:wrap}.links a{color:#175E6D;background:#EFF5F1;border-radius:9px;padding:12px 13px;text-decoration:none;font-weight:750;font-size:17px;min-height:44px}',
      '@media(min-width:600px){.wrap{padding:35px 28px 80px}}'
    ].join("");
    const html = '<!doctype html><html lang="ja"><head><meta charset="UTF-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
      '<style>'+styles+'</style></head><body data-tab="today"><main class="wrap">'+
      '<header><div class="eyebrow">MY LIFE · YOS</div><h1>YOS Today</h1>'+
      '<div class="sub">'+safe(dateText(now))+' · 自分の一日をデザインする</div></header>'+
      '<div class="tabs"><button id="tabToday" onclick="document.body.dataset.tab=\'today\'">今日</button>'+
      '<button id="tabWeek" onclick="document.body.dataset.tab=\'week\'">今週</button></div>'+
      '<div class="today"><section class="hero"><span>今日の優先事項</span><h2>'+safe(focus)+'</h2>'+
      '<p>確定した予定を優先し、空き時間に無理なく取り組む。</p></section>'+
      '<section class="section"><div class="sectionhead"><h3>これからの予定</h3><span class="tag">Appleカレンダー</span></div>'+eventRows+'</section>'+
      '<section class="section"><div class="sectionhead"><h3>大切なこと</h3><span class="tag">最大3件</span></div>'+cards+'</section>'+
      '<section class="section"><h3>習慣・身体</h3>'+habitRows+
      '<p class="muted">健康：'+safe(health || "実測データ未取得")+'</p></section>'+
      '<section class="section"><h3>余白と暮らし</h3>'+
      '<p class="muted">予定を詰めすぎず、食事・休息・楽しむ時間も確保する。空き時間の計算と提案は今後の連携対象。</p></section></div>'+
      '<div class="week"><section class="hero"><span>今週の予定</span><h2>無理なく進める一週間</h2>'+
      '<p>固定予定を確認してから、やることを組み立てる。</p></section>'+
      '<section class="section"><h3>今週のカレンダー</h3>'+weekRows+'</section></div>'+
      '<section class="section"><h3>元データを開く</h3><div class="links">'+
      '<a href="'+URL.tasks+'">YOS Tasks</a><a href="'+URL.home+'">Notion HOME</a>'+
      '<a href="'+URL.life+'">MY LIFE</a></div></section>'+
      '<div class="foot">読み取り専用の初期版。カレンダー・Notion・リマインダーは接続できた範囲のみ表示。'+
      'この画面からの予定変更・タスク完了・習慣記録・Money同期は未対応。'+
      (feed.stale ? 'YOS Tasksは前回データまたは未取得です。' : '')+'</div></main></body></html>';
    const web = new WebView();
    await web.loadHTML(html);
    await web.present(true);
  }

  if(config.runsInWidget){
    Script.setWidget(widget);
  } else {
    await presentLifeBoard();
  }
  Script.complete();
})();