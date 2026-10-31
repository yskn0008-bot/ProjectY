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
  // The full-screen board always reflects the current day; NIGHT is a widget-only mode.
  const night = config.runsInWidget && (nightMode || (!dayMode && now.getHours() >= SETTINGS.eveningHour));
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const target = night ? tomorrow : now;
  const dateKey = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
  const targetKey = dateKey(target);
  const todayKey = dateKey(now);
  const clean = (value, limit=80) => String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0,limit);
  // Explicit taxi-demand markers are reference events, not proven appointments.
  const isReferenceEvent = e =>
    /^[\s　]*[［\[【]\s*タクシー需要\s*[］\]】]/.test(clean(e && e.title,120)) ||
    /タクシー需要/.test(clean(e && e.calendar && e.calendar.title,80));
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
      const ordered = list.filter(e => e && e.title && (e.isAllDay || (validDate(e.endDate || e.startDate) || end) >= (night ? start : now)))
        .sort((a,b) => (a.isAllDay ? -1 : b.isAllDay ? 1 : (+new Date(a.startDate)-+new Date(b.startDate))));
      // Keep imported reference events from displacing the user's other calendar events.
      const selected = ordered.filter(e => !isReferenceEvent(e)).slice(0,10)
        .concat(ordered.filter(isReferenceEvent).slice(0,4))
        .sort((a,b) => (a.isAllDay ? -1 : b.isAllDay ? 1 : (+new Date(a.startDate)-+new Date(b.startDate))));
      return {ok:true, items:selected};
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
          if(Number(req.response && req.response.statusCode)===200 && data && typeof data==="object"){
            // HTTP success alone does not prove the originating Notion/Google projection is current.
            const generated=validDate(data.generatedAt);
            const age=generated ? Date.now()-generated.getTime() : Number.NaN;
            const fresh=generated && Number.isFinite(age) && age>=-5*60000 && age<=24*3600000;
            return {data,stale:!fresh};
          }
        }
      } catch(e) {}
    }
    const age = cached && Number(cached.savedAt) ? Date.now()-Number(cached.savedAt) : Infinity;
    if(age>=0 && age<6*3600000 && cached.data) return {data:cached.data,stale:true};
    return {data:null,stale:true};
  }
  // Optional bounded read-only calendar feed. A missing server feature never blocks Today.
  async function readCalendarTaskWindow(start,end) {
    if (!Keychain.contains(SETTINGS.tokenKey)) return null;
    try {
      const token=Keychain.get(SETTINGS.tokenKey);
      if(!token) return null;
      const req=new Request(SETTINGS.feedUrl+'?mode=calendar&start='+start+'&end='+end);
      req.headers={Authorization:'Bearer '+token,Accept:'application/json'};
      req.timeoutInterval=8;
      const data=await req.loadJSON();
      if(Number(req.response && req.response.statusCode)!==200 ||
        !data || !Array.isArray(data.tasks) ||
        (data.source!=='notion' && data.source!=='projection') ||
        typeof data.sourceComplete!=='boolean' || typeof data.truncated!=='boolean') return null;
      const dated=data.tasks.filter(t=>t && typeof t.title==='string' &&
        typeof t.due==='string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) &&
        t.due>=start && t.due<=end).slice(0,100);
      const generated=validDate(data.generatedAt);
      const age=generated ? Date.now()-generated.getTime() : Infinity;
      return {
        tasks:dated,
        partial:data.truncated || !data.sourceComplete || data.source!=='notion' ||
          !Number.isFinite(age) || age<(-5*60000) || age>24*3600000
      };
    } catch { return null; }
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
    const appointments=result.items.filter(e=>!isReferenceEvent(e));
    if(!appointments.length) return result.items.length ?
      "予定の登録なし（参考イベント"+result.items.length+"件）" :
      (night?"明日の予定なし":"残りの予定なし");
    const e=appointments[0];
    return (e.isAllDay ? "終日 " : time(new Date(e.startDate))+" ") + clean(e.title,38) +
      (appointments.length>1 ? " ほか"+(appointments.length-1)+"件" : "");
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
  // The widget's unused background area opens this same script's full-screen board.
  // Scriptable generates its own run URL, so no script name is assumed.
  widget.url = typeof URLScheme !== "undefined" && typeof URLScheme.forRunningScript === "function"
    ? URLScheme.forRunningScript() : URL.home;
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
  const firstAppointment=events.items.find(e=>!isReferenceEvent(e));
  section(widget,"calendar",night?"明日の予定":"次の予定",calendarLabel(events),
    firstAppointment ? urlForCalendar(new Date(firstAppointment.startDate)):widget.url,C.blue);
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
    // Only links that the user intentionally opens are exposed; never auto-run task URLs.
    const actionLink = value => {
      const raw=String(value||"").trim();
      if (!/^(https?:|shortcuts:|scriptable:|calshow:)/i.test(raw) ||
        /[\u0000-\u0020\u007f<>"']/u.test(raw) || raw.length>2000) return '';
      const label=/^shortcuts:/i.test(raw) ? 'ショートカットを起動' :
        /^scriptable:/i.test(raw) ? 'Scriptableを起動' : '操作先を開く';
      return '<a class="tasklink" href="'+escapeHtml(raw)+'">'+label+'</a>';
    };
    const feedItems = feed.data && Array.isArray(feed.data.tasks) ? feed.data.tasks :
      (feed.data && feed.data.task ? [feed.data.task] : []);
    // Only confirmed, non-overdue tasks can become the today's focus.
    // An old task may already be completed on the user's device; don't imply it is definitely undone.
    const taskTitle = (t, limit=100) => clean(t && t.title,limit).replace(/^\d{1,3}\s*[｜|]\s*/,"");
    const tasks = feedItems.filter(t => t && taskTitle(t)).slice(0,3);
    const validDue = t => /^\d{4}-\d{2}-\d{2}$/.test(String(t && t.due || "").slice(0,10));
    const overdueTasks = tasks.filter(t => validDue(t) && String(t.due).slice(0,10) < todayKey);
    const upcomingTasks = tasks.filter(t => !(validDue(t) && String(t.due).slice(0,10) < todayKey));
    // The top card describes the day's *overview* instead of repeating the first task.
    // Reference-calendar events must never be counted as personal appointments.
    const personalEvents = events.items.filter(e => !isReferenceEvent(e));
    const referenceEvents = events.items.filter(isReferenceEvent);
    const focus = !events.ok ? "今日の予定は未取得" :
      personalEvents.length ? "登録された予定 "+personalEvents.length+"件" :
      "参考以外の予定は未登録";
    const focusNote = feed.stale ? "タスクの最新状態は未確認。" :
      upcomingTasks.length ? "優先タスク "+upcomingTasks.length+"件を確認。無理なく進めよう。" :
      overdueTasks.length ? "期限が過ぎたタスクの状態を確認。" :
      "タスクは未登録または取得範囲外。";

    const cards = upcomingTasks.length ? upcomingTasks.map((t,i) =>
      '<div class="task"><div class="num">'+(i+1)+'</div><div class="grow"><b>'+safe(taskTitle(t))+'</b>'+
      (validDue(t) ? '<small>期限 '+safe(String(t.due).slice(0,10))+'</small>' : '')+
      (t.nextAction ? '<details><summary>対応内容を見る</summary><p>'+safe(t.nextAction)+'</p></details>' : '')+
      actionLink(t.actionUrl)+'</div></div>'
    ).join("") : '<p class="muted">いま取り組むタスクの登録は確認できません。</p>';
    // Expired rows can already be done. Keep the warning visible, not a large task card.
    const overdueNotice = overdueTasks.length ?
      '<details class="overdue"><summary>要確認｜期限が過ぎた登録 '+overdueTasks.length+'件</summary>'+
      '<div class="overduebody"><p>完了済みの可能性があります。未完了とは判定していません。</p>'+
      overdueTasks.map(t => '<div class="overduerow">'+safe(taskTitle(t,110))+
      ' · 期限 '+safe(String(t.due).slice(0,10))+'</div>').join('')+
      '<a href="'+URL.tasks+'">Notionで状態を確認</a></div></details>' : '';
    const eventRows = events.ok ?
      (personalEvents.length ? personalEvents.map(e => '<div class="event"><time>'+
        (e.isAllDay ? '終日' : escapeHtml(time(new Date(e.startDate))))+
        '</time><div><b>'+safe(e.title)+'</b>'+
        (e.location ? '<small>'+safe(e.location)+'</small>' : '')+'</div></div>').join("") :
        '') :
        '<p class="muted">Appleカレンダー未取得。予定は確認できていません。</p>';
    const referenceRows = referenceEvents.length ?
      '<details class="refcalendar"><summary>参考イベント '+referenceEvents.length+'件（予定とは別）</summary>'+
      referenceEvents.map(e => '<div class="event"><time>'+(e.isAllDay?'終日':escapeHtml(time(new Date(e.startDate))))+
      '</time><div><b>'+safe(e.title)+'</b></div></div>').join('')+'</details>' : '';
    // Quiet days should show actionable tasks first, not two oversized "no plans" notices.
    const quietDay = events.ok && personalEvents.length === 0;
    const quickStatus = (feed.stale ? 'タスク未確認' : '優先 '+upcomingTasks.length+'件')+
      (referenceEvents.length ? ' · 参考 '+referenceEvents.length+'件' : '');
    const overviewHTML = quietDay ?
      '<div class="quick"><b>今日の見通し</b><span>予定の登録なし · '+quickStatus+'</span></div>' :
      '<section class="hero"><span>今日の見通し</span><h2>'+safe(focus)+'</h2>'+
      '<p>'+safe(focusNote)+'</p></section>';
    const taskSection = '<section class="section"><div class="sectionhead"><h3>大切なこと</h3>'+
      '<span class="tag">優先最大3件</span></div>'+cards+overdueNotice+'</section>';
    // A suggestion is not a calendar booking or an assertion that the time is genuinely free.
    const datedEvents = personalEvents.filter(e=>!e.isAllDay && validDate(e.startDate));
    const ongoingEvent = datedEvents.find(e => {
      const start=validDate(e.startDate),end=validDate(e.endDate);
      return start && end && start<=now && end>now;
    });
    const nextEvent = datedEvents.find(e => validDate(e.startDate)>now);
    const allDay = personalEvents.find(e=>e.isAllDay);
    const nextAction = upcomingTasks[0] && !feed.stale ?
      clean(upcomingTasks[0].nextAction || taskTitle(upcomingTasks[0]),90) : '';
    let adviceTitle = '今日の確認';
    let adviceDetail = '予定・タスクを確認し、余白を残して過ごそう。';
    if(!events.ok) {
      adviceTitle = 'まず予定を確認';
      adviceDetail = 'カレンダーが取得できていないため、空き時間を推定しません。';
    } else if(allDay) {
      adviceTitle = '終日予定を確認';
      adviceDetail = '終日予定が登録されています。行動を組む前に内容を確認しよう。';
    } else if(ongoingEvent) {
      adviceTitle = '登録済みの予定を優先';
      adviceDetail = '現在の時間帯に予定が登録されています。タスクは予定のあとに検討しよう。';
    } else if(nextEvent) {
      const until = Math.max(0,Math.floor((validDate(nextEvent.startDate)-now)/60000));
      if(until<=30) {
        adviceTitle = '次の予定の準備を優先';
        adviceDetail = '次の予定まで約'+until+'分。移動・準備時間は未計算です。';
      } else if(nextAction && until<=90) {
        adviceTitle = '短い作業に着手する候補';
        adviceDetail = '次の予定まで約'+until+'分。移動・準備の時間を除いて、'+nextAction;
      } else if(nextAction) {
        adviceTitle = '優先タスクの次の一手';
        adviceDetail = '次の登録予定まで約'+Math.floor(until/60)+'時間。所要時間は未確認：'+nextAction;
      } else {
        adviceTitle = '次の予定に向けた準備';
        adviceDetail = '次の登録予定まで約'+until+'分。移動・準備時間は未計算です。';
      }
    } else if(feed.stale) {
      adviceTitle = 'タスクの最新状態を確認';
      adviceDetail = '予定は未登録ですが、タスクは未取得または前回の情報です。';
    } else if(nextAction) {
      adviceTitle = '優先タスクの次の一手';
      adviceDetail = '予定の登録はありません。実際の空き時間を確認して着手する候補：'+nextAction;
    } else if(overdueTasks.length) {
      adviceTitle = '期限切れ登録の状態を確認';
      adviceDetail = '完了済みか未完了かを確認してから、今日の行動を決めよう。';
    }
    // Lead with one action. Put long background and the unverified time assumptions behind a tap.
    const actionFirst = nextAction && !feed.stale &&
      (adviceTitle === '優先タスクの次の一手' || adviceTitle === '短い作業に着手する候補');
    const mainAction = actionFirst ? clean(nextAction,34)+(nextAction.length>34?'…':'') : adviceTitle;
    const briefContext = !events.ok ? 'カレンダー未取得' :
      ongoingEvent ? '登録された予定が進行中' :
      allDay ? '終日予定あり' :
      nextEvent ? '次の予定 '+time(new Date(nextEvent.startDate))+'（移動・準備時間は未計算）' :
      '参考以外の予定は未登録・空き時間は未確認';
    const adviceSection = '<div class="suggestion"><span>YOSの提案 · 今の候補</span>'+
      '<b>'+safe(mainAction)+'</b><p>'+safe(briefContext)+'</p>'+
      '<details class="reason"><summary>判断理由を確認</summary><p>'+safe(adviceTitle+'：'+adviceDetail)+'</p></details></div>';
    const calendarSection = events.ok && !personalEvents.length && !referenceEvents.length ? '' :
      '<section class="section"><div class="sectionhead"><h3>これからの予定</h3>'+
      '<span class="tag">Appleカレンダー</span></div>'+eventRows+referenceRows+'</section>';
    const routine = reminders.ok ? reminders.items.filter(r => 
      /ルーティン|習慣|routine/i.test(clean(r.calendar && r.calendar.title,60))
    ).slice(0,4) : [];
    const habitRows = routine.length ? routine.map(r =>
      '<div class="habit"><span class="dot"></span>'+safe(r.title)+'</div>').join("") :
      '<p class="muted">習慣の実施記録は未連携。完了状態は未確認です。</p>';
    const habitSection = '<section class="section"><h3>習慣・身体</h3>'+
      (routine.length || health ?
        habitRows+(health?'<p class="muted">健康：'+safe(health)+'</p>':'') :
        '<p class="muted">習慣の実施記録と健康の実測情報は未連携です。</p>')+
      '<div class="links"><a href="'+URL.life+'">MY LIFEで記録を見る</a></div></section>';
    const monday = new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));
    const nextMonday = new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+7);
    const sunday = new Date(nextMonday.getFullYear(),nextMonday.getMonth(),nextMonday.getDate()-1);
    const fullWeekTasks=await readCalendarTaskWindow(dateKey(monday),dateKey(sunday));
    const taskDueMap = new Map();
    // When the new server mode is not deployed yet, use only the existing three-task feed.
    const weekDueSource=fullWeekTasks?fullWeekTasks.tasks:tasks;
    for (const task of weekDueSource) {
      if (!task || !/^\d{4}-\d{2}-\d{2}$/.test(String(task.due || '').slice(0,10))) continue;
      const key=String(task.due).slice(0,10);
      if (!taskDueMap.has(key)) taskDueMap.set(key,[]);
      taskDueMap.get(key).push(fullWeekTasks?clean(task.title,100):taskTitle(task,80));
    }
    const dueCoverage=fullWeekTasks ?
      (fullWeekTasks.partial ?
        '期限タスクは取得できた範囲だけ表示。元データの欠落や更新遅延の可能性があります。' :
        '期限タスクは既存YOS Tasksから読み取り表示。個別タスクの更新状態は元データを確認してください。') :
      '期限タスクは優先最大3件のみ。全タスク取得機能は未接続です。';
    let weekEvents = null;
    try { weekEvents = await CalendarEvent.between(monday,nextMonday); }
    catch(e) { weekEvents = null; }
    const weekRows = Array.from({length:7},(_,i) => {
        const d=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i);
        const start=new Date(d.getFullYear(),d.getMonth(),d.getDate());
        const end=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);
        const dueTasks = taskDueMap.get(dateKey(d)) || [];
        const dayEvents=(weekEvents || []).filter(e => e && e.title && new Date(e.startDate)<end &&
          new Date(e.endDate || e.startDate)>start).sort((a,b)=>new Date(a.startDate)-new Date(b.startDate));
        const appointments = dayEvents.filter(e => !isReferenceEvent(e));
        const references = dayEvents.filter(isReferenceEvent);
        return '<div class="weekrow"><div class="weekday">'+escapeHtml(dateText(d))+'</div><div class="grow">'+
          (appointments.length ? appointments.slice(0,3).map(e =>
            '<div class="weekevent">'+(e.isAllDay?'終日':escapeHtml(time(new Date(e.startDate))))+' '+safe(e.title)+'</div>'
          ).join("")+(appointments.length>3?'<small>ほか'+(appointments.length-3)+'件</small>':'') :
          '<span class="muted">'+(weekEvents===null?'予定未取得':'参考以外の予定なし')+'</span>')+
          references.slice(0,2).map(e=>'<div class="weekref">参考｜'+safe(e.title)+'</div>').join('')+
          (references.length>2?'<small>参考イベント ほか'+(references.length-2)+'件</small>':'')+
          dueTasks.slice(0,3).map(title => '<div class="weekdue">期限｜'+safe(title)+'</div>').join('')+
          (dueTasks.length>3?'<details class="more-due"><summary>ほかの期限 '+(dueTasks.length-3)+'件</summary>'+
           dueTasks.slice(3).map(title=>'<div class="weekdue">期限｜'+safe(title)+'</div>').join('')+'</details>':'')+'</div></div>';
      }).join("");
    const styles = [
      '*{box-sizing:border-box}body{margin:0;background:#F5F5F2;color:#252C2A;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;font-size:16px}',
      '.wrap{max-width:640px;margin:auto;padding:112px 18px 72px}.eyebrow{font-size:15px;letter-spacing:.10em;font-weight:800;color:#53665C}',
      'h1{font-size:31px;letter-spacing:-.04em;margin:6px 0 8px}.sub{font-size:17px;color:#515C56}header{padding-bottom:2px}',
      '.tabs{display:flex;gap:6px;border-radius:14px;background:#E7EAE6;padding:5px;margin:22px 0 18px}',
      '.tabs button{width:50%;min-height:48px;border:0;border-radius:10px;padding:13px;font-size:18px;font-weight:750;background:transparent;color:#46554C}',
      'body[data-tab=today] #tabToday,body[data-tab=week] #tabWeek{background:#fff;color:#253A33;box-shadow:0 2px 10px #18221C12}',
      'body[data-tab=today] .week,body[data-tab=week] .today{display:none}',
      '.hero{background:linear-gradient(130deg,#FCE6C6,#E5F1E8);color:#263B33;border:1px solid #E9DDD0;border-radius:20px;padding:20px 19px;margin-bottom:14px}.quick{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:7px 12px;background:#EEF2EB;border:1px solid #DBE6DB;border-radius:14px;padding:15px 17px;margin-bottom:13px}.quick b{font-size:17px;color:#2F5244}.quick span{font-size:17px;color:#344E42;font-weight:700}.quick small{font-size:15px;color:#65756B}.suggestion{padding:15px 17px;border-radius:16px;background:#EAF1F8;border:1px solid #D4E3EF;margin:12px 0}.suggestion span{display:block;font-size:14px;color:#426780;font-weight:750}.suggestion b{display:block;font-size:19px;color:#264B64;margin-top:6px}.suggestion p{font-size:16px;line-height:1.5;margin:7px 0 0;color:#3D5263;overflow-wrap:anywhere}.reason{margin-top:9px}.reason summary{font-size:16px;font-weight:700;color:#24637B;min-height:44px;padding:10px 0;cursor:pointer}.reason p{font-size:16px;color:#45586A;line-height:1.55;margin:0;padding-bottom:6px}',
      '.hero span{font-size:16px;font-weight:700;color:#566A5C}.hero h2{font-size:23px;line-height:1.37;margin:9px 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.hero p{font-size:16px;color:#566258;line-height:1.45;margin:0}',
      '.section{background:white;border:1px solid #DFE5DD;border-radius:18px;padding:17px 17px;margin:12px 0;box-shadow:0 2px 7px #18221C08}.today .section:nth-of-type(2){border-left:5px solid #609BB7}.today .section:nth-of-type(3){border-left:5px solid #C79A54}.today .section:nth-of-type(4){border-left:5px solid #6F9E80}.today .section:nth-of-type(5){border-left:5px solid #B5A0C7}',
      'h3{margin:0 0 15px;font-size:22px;letter-spacing:-.02em}.sectionhead{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}',
      '.tag{color:#516B5C;font-size:15px;font-weight:700}.muted{color:#5D6961;font-size:17px;line-height:1.65;margin:7px 0}',
      '.event,.task,.weekrow{display:flex;gap:14px;padding:15px 0;border-top:1px solid #EAEEE8}.event:first-of-type,.task:first-of-type{border-top:0}',
      '.event time{width:58px;flex-shrink:0;font-size:18px;color:#206D90;font-weight:800}.event b,.task b{display:block;font-size:19px;line-height:1.5}',
      '.event small,.task small{display:block;color:#5D6B61;margin-top:5px;line-height:1.45;font-size:16px}.task b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.task details{margin-top:8px}.task summary{color:#206D90;font-size:16px;font-weight:700;cursor:pointer;min-height:34px}.task details p{margin:6px 0;font-size:16px;line-height:1.55;white-space:normal;overflow-wrap:anywhere}.tasklink{display:inline-block;color:#1C6477;font-size:16px;font-weight:750;padding:11px 0;text-decoration:underline;min-height:44px}',
      '.grow{flex:1;min-width:0;overflow-wrap:anywhere}.num{background:#F3E9DB;color:#87571F;border-radius:10px;width:33px;height:33px;display:grid;place-items:center;flex-shrink:0;font-weight:800}',
      '.habit{padding:12px 0;font-size:19px;line-height:1.5}.dot{display:inline-block;width:11px;height:11px;border:2px solid #6D9A85;border-radius:50%;margin-right:12px}',
      '.weekrow{align-items:start}.weekday{width:80px;font-size:17px;font-weight:800;flex-shrink:0}.weekevent{font-size:17px;margin-bottom:9px;line-height:1.5}.weekref{font-size:15px;color:#65746A;line-height:1.4;padding:6px 0}.weekdue{font-size:16px;font-weight:700;color:#825A2B;background:#F9F2E8;padding:8px;border-radius:9px;margin:7px 0}.more-due summary{color:#7A5928;font-size:16px;font-weight:700;padding:11px 0;min-height:44px}',
      '.foot{color:#58665D;font-size:14px;line-height:1.7;padding:12px 3px}.refcalendar{margin-top:8px;border-top:1px dashed #DCE3DB;padding:12px 0 0}.refcalendar summary{font-size:16px;color:#336E84;font-weight:700;cursor:pointer;min-height:40px}.refcalendar .event b{font-size:16px;color:#56645B}.overdue{border-radius:12px;background:#FFF4E8;border:1px solid #E8C79E;padding:0;margin-top:12px}.overdue summary{font-size:16px;color:#81572A;font-weight:700;min-height:48px;padding:14px;cursor:pointer}.overduebody{padding:0 14px 15px}.overdue p{font-size:15px;line-height:1.4;color:#674F36;margin:7px 0}.overduerow{font-size:15px;color:#674F36;padding:8px 0;border-top:1px solid #EAD8C4;overflow-wrap:anywhere}.overdue a{font-size:16px;font-weight:700;color:#1A6378;display:inline-block;margin-top:9px;min-height:34px}',
      '.links{display:flex;gap:8px;flex-wrap:wrap}.links a{color:#175E6D;background:#EFF5F1;border-radius:9px;padding:12px 13px;text-decoration:none;font-weight:750;font-size:17px;min-height:44px}',
      '@media(min-width:600px){.wrap{padding:112px 28px 72px}}'
    ].join("");
    const html = '<!doctype html><html lang="ja"><head><meta charset="UTF-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
      '<style>'+styles+'</style></head><body data-tab="today"><main class="wrap">'+
      '<header><div class="eyebrow">MY LIFE · YOS</div><h1>YOS Today</h1>'+
      '<div class="sub">'+safe(dateText(now))+' · 自分の一日をデザインする</div></header>'+
      '<div class="tabs"><button id="tabToday" onclick="document.body.dataset.tab=\'today\'">今日</button>'+
      '<button id="tabWeek" onclick="document.body.dataset.tab=\'week\'">今週</button></div>'+
      '<div class="today">'+overviewHTML+
      (quietDay?taskSection+adviceSection+habitSection+calendarSection:calendarSection+adviceSection+taskSection+habitSection)+
      '<section class="section"><h3>余白と暮らし</h3>'+
      '<p class="muted">休息・食事・楽しみの時間も大切に。空き時間の自動計算は未対応です。</p></section></div>'+
      '<div class="week"><section class="hero"><span>今週の予定</span><h2>無理なく進める一週間</h2>'+
      '<p>固定予定を確認してから、やることを組み立てる。</p></section>'+
      '<section class="section"><h3>今週のカレンダー</h3>'+weekRows+
      '<p class="muted">'+safe(dueCoverage)+'</p></section></div>'+
      '<section class="section"><h3>元データを開く</h3><div class="links">'+
      '<a href="'+URL.tasks+'">YOS Tasks</a><a href="'+URL.home+'">Notion HOME</a>'+
      '<a href="'+URL.life+'">MY LIFE</a></div></section>'+
      '<div class="foot">読み取り専用。カレンダー・Notion・リマインダーは取得できた範囲のみ表示。'+
      'この画面からの予定変更・タスク完了・習慣記録・Money同期は未対応。'+
      (feed.stale ? 'YOS Tasksの鮮度は未確認（前回データ・更新時刻不明・取得失敗など）。' : '')+'</div></main></body></html>';
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