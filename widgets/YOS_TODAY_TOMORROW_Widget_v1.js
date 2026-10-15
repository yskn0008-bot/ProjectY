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
    item.minimumScaleFactor = 0.83;
    return item;
  }
  function section(widget, icon, title, value, link, accent) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.setPadding(3,0,3,0);
    if(link) row.url = link;
    const sym = SFSymbol.named(icon);
    sym.applyFont(Font.systemFont(14));
    const img = row.addImage(sym.image);
    img.imageSize = new Size(14,14);
    img.tintColor = colour(accent || C.gold);
    row.addSpacer(8);
    const content = row.addStack();
    content.layoutVertically();
    label(content,title,11,C.soft,true);
    content.addSpacer(2);
    label(content,value,14,C.ink,true,2);
    row.addSpacer();
    const chevron = SFSymbol.named("chevron.right");
    chevron.applyFont(Font.systemFont(9));
    const arrow = row.addImage(chevron.image);
    arrow.imageSize = new Size(8,10);
    arrow.tintColor = colour(C.soft);
    return row;
  }
  function separator(widget) {
    widget.addSpacer(4);
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
    if(!reminders.ok) return "記録を確認できません";
    const routine = reminders.items.filter(r => {
      const listName = clean(r.calendar && r.calendar.title,60);
      return /ルーティン|習慣|routine/i.test(listName);
    }).filter(r => !r.dueDate || dateKey(new Date(r.dueDate))<=targetKey);
    if(routine.length) return "未完了 "+routine.length+"件（リマインダー）";
    return "MY LIFEの実施記録を確認";
  }
  const [events,reminders,feed,health] = await Promise.all([
    readCalendar(target),readReminders(),readYosFeed(),readHealth()
  ]);
  const widget = new ListWidget();
  widget.url = URL.home;
  widget.refreshAfterDate = new Date(Date.now()+SETTINGS.refreshMinutes*60000);
  widget.setPadding(16,17,15,17);
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
  label(header,night?"YOS TOMORROW":"YOS TODAY",18,C.ink,true);
  header.addSpacer();
  label(header,dateText(target),11,C.soft,false);
  widget.addSpacer(6);
  label(widget,night?"明日のために、今夜できること":"今日、必要なことだけ",12,C.gold,true);
  separator(widget);
  section(widget,"calendar",night?"明日の予定":"次の予定",calendarLabel(events),
    events.items.length ? urlForCalendar(new Date(events.items[0].startDate)):URL.home,C.blue);
  separator(widget);
  section(widget,"checkmark.circle",night?"期限・持ち越し":"今日のリマインダー",reminderLabel(reminders),
    URL.home,C.green);
  separator(widget);
  section(widget,"list.bullet.rectangle",night?"明日に向けた優先事項":"YOSの優先タスク",yosTask(feed),
    URL.tasks,C.gold);
  separator(widget);
  section(widget,"arrow.triangle.2.circlepath",night?"明朝のルーティン":"ルーティン",routineLabel(reminders),
    URL.life,C.green);
  separator(widget);
  section(widget,"heart",night?"今日の健康・休息":"ヘルスケア",
    health || "ヘルスケア未連携（実測値のみ表示）",URL.life,C.coral);
  widget.addSpacer();
  const footer=widget.addStack();
  footer.layoutHorizontally();
  label(footer,night?"夜の準備モード":"今日の情報モード",10,C.soft,false);
  footer.addSpacer();
  const alert=label(footer,"要対応を見る  ›",11,C.gold,true);
  footer.url=URL.alerts;
  if(config.runsInWidget){
    Script.setWidget(widget);
  } else {
    await widget.presentLarge();
  }
  Script.complete();
})();