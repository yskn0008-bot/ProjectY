// YOS Dashboard Widget v1
// Scriptable — one source, two Home Screen widgets.
// Widget Parameter: NOW (medium) / TODAY (large)
// Existing sources only: YOS Tasks private feed, iPhone Calendar, YOS Money money.json.
// Routines are launch buttons only; completion is not inferred without a confirmed shared routine state.

const PARAM = (args.widgetParameter || "NOW").trim().toUpperCase();

const CONFIG = {
  feedUrl: "https://project-y-yos-ai.vercel.app/api/yos/widget",
  keychainKey: "MY_WAY_WIDGET_TOKEN",
  taskCacheFile: "my-way-now-widget-cache-v1.json",
  moneyRelativePath: "YOS/Money/money.json",
  refreshMinutes: 15,
};

const URLS = {
  HOME: "https://yskn0008-bot.github.io/ProjectY/yos/",
  MORNING: "shortcuts://run-shortcut?name=" + encodeURIComponent("Morning"),
  NIGHT: "shortcuts://run-shortcut?name=" + encodeURIComponent("Night Brief"),
};

const COLORS = {
  bg1: "#FAF4E7",
  bg2: "#F3EBDD",
  paper: "#FBF8F2",
  text: "#2D3935",
  muted: "#77756E",
  faint: "#A69D90",
  gold: "#A77D35",
  goldSoft: "#F1E6C9",
  green: "#6F9A86",
  greenSoft: "#E4EFE9",
  blue: "#4D8FAE",
  blueSoft: "#DDEDF3",
  coral: "#B87867",
  coralSoft: "#F2E4DE",
};

const localFM = FileManager.local();
const iCloudFM = FileManager.iCloud();
const taskCachePath = localFM.joinPath(localFM.documentsDirectory(), CONFIG.taskCacheFile);

function color(hex, alpha = 1) { return new Color(hex, alpha); }
function font(size, weight = "regular") {
  if (weight === "bold") return Font.boldSystemFont(size);
  if (weight === "semibold") return Font.semiboldSystemFont(size);
  if (weight === "medium") return Font.mediumSystemFont(size);
  return Font.systemFont(size);
}
function clean(value, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/gu, " ").trim().slice(0, max);
}
function cleanTaskTitle(value) {
  return clean(value).replace(/^\d{1,3}\s*[｜|]\s*/u, "").trim();
}
function nowDisplayTitle(value) {
  const title = cleanTaskTitle(value).replace(/^ProjectY\s*[｜|]\s*/iu, "").trim();
  if (title.length <= 18 || title.includes("\n")) return title;

  const candidates = [];
  for (let i = 0; i < title.length; i++) {
    if (title[i] !== " ") continue;
    const left = title.slice(0, i).trim();
    const right = title.slice(i + 1).trim();
    if (left.length < 6 || right.length < 6) continue;
    const longest = Math.max(left.length, right.length);
    const balance = Math.abs(left.length - right.length);
    candidates.push({i, score: longest + balance * 0.2});
  }
  if (!candidates.length) return title;

  candidates.sort((a, b) => a.score - b.score);
  const split = candidates[0].i;
  return title.slice(0, split).trim() + "\n" + title.slice(split + 1).trim();
}
function yen(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return "¥" + Math.round(number).toLocaleString("ja-JP");
}
function setBackground(widget) {
  const gradient = new LinearGradient();
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  gradient.locations = [0, 0.58, 1];
  gradient.colors = [color(COLORS.bg1), color(COLORS.paper), color(COLORS.bg2)];
  widget.backgroundGradient = gradient;
}
function addSymbol(parent, name, size, tint) {
  const sf = SFSymbol.named(name);
  sf.applyFont(Font.systemFont(size));
  const image = parent.addImage(sf.image);
  image.imageSize = new Size(size, size);
  image.tintColor = color(tint);
  return image;
}
function addSectionLabel(parent, symbol, label, tint = COLORS.gold) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  addSymbol(row, symbol, 15, tint);
  row.addSpacer(7);
  const text = row.addText(label);
  text.font = font(14, "bold");
  text.textColor = color(tint);
  text.letterSpacing = 0.5;
  return row;
}
function addDivider(parent) {
  parent.addSpacer(9);
  const line = parent.addStack();
  line.size = new Size(0, 1);
  line.backgroundColor = color("#D9D0C2", 0.72);
  parent.addSpacer(9);
}
function formatDateHeader(date = new Date()) {
  const df = new DateFormatter();
  df.locale = "ja_JP";
  df.dateFormat = "M/d EEE";
  return df.string(date);
}
function formatTime(date) {
  const df = new DateFormatter();
  df.locale = "ja_JP";
  df.dateFormat = "HH:mm";
  return df.string(date);
}

function readTaskCache() {
  try {
    if (!localFM.fileExists(taskCachePath)) return null;
    const parsed = JSON.parse(localFM.readString(taskCachePath));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}
function writeTaskCache(data) {
  try { localFM.writeString(taskCachePath, JSON.stringify({savedAt: Date.now(), data})); } catch {}
}
async function fetchTaskFeed(token) {
  const request = new Request(CONFIG.feedUrl);
  request.method = "GET";
  request.headers = {Authorization: `Bearer ${token}`, Accept: "application/json"};
  request.timeoutInterval = 10;
  const data = await request.loadJSON();
  const status = Number(request.response?.statusCode || 0);
  if (status !== 200 || !data || typeof data !== "object") throw new Error(`feed ${status}`);
  writeTaskCache(data);
  return {data, stale: false, needsSetup: false};
}
async function loadTaskFeed() {
  const cached = readTaskCache();
  if (!Keychain.contains(CONFIG.keychainKey)) {
    return {data: cached?.data || null, stale: true, needsSetup: true};
  }
  const token = clean(Keychain.get(CONFIG.keychainKey), 512);
  if (!token) return {data: cached?.data || null, stale: true, needsSetup: true};
  try { return await fetchTaskFeed(token); }
  catch { return {data: cached?.data || null, stale: true, needsSetup: false}; }
}
function tasksFromFeed(result) {
  const data = result?.data || {};
  const list = Array.isArray(data.tasks) ? data.tasks : (data.task ? [data.task] : []);
  return list
    .filter(item => item && cleanTaskTitle(item.title))
    .slice(0, 3)
    .map(item => ({
      title: cleanTaskTitle(item.title),
      state: clean(item.state, 30),
      due: clean(item.due, 80),
      nextAction: clean(item.nextAction, 240),
    }));
}

async function loadTodayEvents() {
  try {
    const now = new Date();
    const events = await CalendarEvent.today();
    const items = events
      .filter(event => event?.isAllDay === true || new Date(event?.endDate || event?.startDate || 0) >= now)
      .sort((a, b) => {
        if (a?.isAllDay && !b?.isAllDay) return -1;
        if (!a?.isAllDay && b?.isAllDay) return 1;
        return new Date(a?.startDate || 0) - new Date(b?.startDate || 0);
      })
      .slice(0, 3)
      .map(event => ({
        title: clean(event.title || "予定", 90),
        time: event.isAllDay ? "終日" : formatTime(new Date(event.startDate)),
        isAllDay: event.isAllDay === true,
      }));
    return {ok: true, items};
  } catch (error) {
    return {ok: false, items: [], error: clean(error?.message || error, 120)};
  }
}

async function loadMoney() {
  try {
    const path = iCloudFM.joinPath(iCloudFM.documentsDirectory(), CONFIG.moneyRelativePath);
    if (!iCloudFM.fileExists(path)) return {amount: null, available: false};
    try {
      if (typeof iCloudFM.isFileStoredIniCloud === "function" && iCloudFM.isFileStoredIniCloud(path)) {
        await iCloudFM.downloadFileFromiCloud(path);
      }
    } catch {}
    const data = JSON.parse(iCloudFM.readString(path));
    const amount = Number(data?.balance?.amount);
    return {amount: Number.isFinite(amount) ? amount : null, available: Number.isFinite(amount)};
  } catch {
    return {amount: null, available: false};
  }
}

function addHeader(widget, title) {
  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const mark = row.addStack();
  mark.size = new Size(40, 40);
  mark.backgroundColor = color(COLORS.goldSoft, 0.95);
  mark.cornerRadius = 20;
  mark.centerAlignContent();
  addSymbol(mark, "sun.max.fill", 19, COLORS.gold);
  row.addSpacer(10);
  const copy = row.addStack();
  copy.layoutVertically();
  const brand = copy.addText("YOS");
  brand.font = font(12, "bold");
  brand.textColor = color(COLORS.gold);
  brand.letterSpacing = 0.8;
  const name = copy.addText(title);
  name.font = font(22, "bold");
  name.textColor = color(COLORS.text);
  row.addSpacer();
  const date = row.addText(formatDateHeader());
  date.font = font(15, "semibold");
  date.textColor = color(COLORS.muted);
}

function addTaskLine(parent, task, prominent = false) {
  // Scriptable truncates wrapped text when it shares a horizontal row with the status dot.
  // Render the title as its own full-width block so two-line wrapping is reliable.
  const displayTitle = prominent ? nowDisplayTitle(task.title) : task.title;
  const text = parent.addText(displayTitle || "今すぐやることなし");
  text.font = font(prominent ? 25 : 17, prominent ? "bold" : "semibold");
  text.textColor = color(COLORS.text);
  text.lineLimit = 2;
  text.minimumScaleFactor = prominent ? 0.84 : 0.88;
  return text;
}
function addEventLine(parent, event, compact = false) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const time = row.addText(event?.time || "—");
  time.font = font(compact ? 13 : 16, "bold");
  time.textColor = color(COLORS.blue);
  time.lineLimit = 1;
  row.addSpacer(9);
  const title = row.addText(event?.title || "予定なし");
  title.font = font(compact ? 14 : 17, "semibold");
  title.textColor = color(COLORS.text);
  title.lineLimit = 1;
  title.minimumScaleFactor = 0.72;
  return row;
}
function addRoutineButton(parent, label, symbol, url, tint, fill) {
  const button = parent.addStack();
  button.layoutHorizontally();
  button.centerAlignContent();
  button.setPadding(11, 14, 11, 14);
  button.backgroundColor = color(fill, 0.94);
  button.cornerRadius = 16;
  button.url = url;
  addSymbol(button, symbol, 16, tint);
  button.addSpacer(7);
  const text = button.addText(label);
  text.font = font(15, "bold");
  text.textColor = color(tint);
  return button;
}

function makeNow(taskResult, calendarResult, money) {
  const events = calendarResult?.items || [];
  const widget = new ListWidget();
  setBackground(widget);
  widget.setPadding(14, 16, 14, 16);
  widget.url = URLS.HOME;
  widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);

  addHeader(widget, "NOW");
  widget.addSpacer(9);

  const tasks = tasksFromFeed(taskResult);
  const current = tasks[0] || null;
  addSectionLabel(widget, "scope", taskResult?.stale ? "今やる · 前回" : "今やる", taskResult?.stale ? COLORS.muted : COLORS.gold);
  widget.addSpacer(6);

  if (taskResult?.needsSetup && !current) {
    const setup = widget.addText("タスク接続設定が必要");
    setup.font = font(19, "bold");
    setup.textColor = color(COLORS.text);
  } else if (current) {
    addTaskLine(widget, current, true);

    // Medium widgets have limited vertical space. Protect the task title first:
    // long titles keep their second line, while "次 →" appears only when the title is short enough.
    const titleNeedsTwoLines = current.title.length > 18;
    if (current.nextAction && !titleNeedsTwoLines) {
      widget.addSpacer(4);
      const next = widget.addText("次 → " + current.nextAction);
      next.font = font(13, "medium");
      next.textColor = color(COLORS.muted);
      next.lineLimit = 1;
      next.minimumScaleFactor = 0.9;
    }
  } else {
    const quiet = widget.addText("今すぐやることなし");
    quiet.font = font(19, "bold");
    quiet.textColor = color(COLORS.text);
  }

  widget.addSpacer();
  const footer = widget.addStack();
  footer.layoutHorizontally();
  footer.centerAlignContent();

  addSymbol(footer, "calendar", 13, calendarResult?.ok === false ? COLORS.coral : COLORS.blue);
  footer.addSpacer(6);
  const nextEvent = events[0];
  const calendar = footer.addText(
    calendarResult?.ok === false ? "カレンダーを確認" :
    nextEvent ? `${nextEvent.time} ${nextEvent.title}` : "予定なし"
  );
  calendar.font = font(14, "semibold");
  calendar.textColor = color(COLORS.muted);
  calendar.lineLimit = 1;
  calendar.minimumScaleFactor = 0.68;

  footer.addSpacer();
  const moneyText = footer.addText(yen(money.amount));
  moneyText.font = font(18, "bold");
  moneyText.textColor = color(COLORS.blue);
  return widget;
}

function makeToday(taskResult, calendarResult, money) {
  const events = calendarResult?.items || [];
  const widget = new ListWidget();
  setBackground(widget);
  widget.setPadding(16, 17, 16, 17);
  widget.url = URLS.HOME;
  widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);

  addHeader(widget, "TODAY");
  widget.addSpacer(10);

  addSectionLabel(widget, "calendar", "CALENDAR", COLORS.blue);
  widget.addSpacer(6);
  if (calendarResult?.ok === false) {
    const error = widget.addText("カレンダーを確認");
    error.font = font(17, "semibold");
    error.textColor = color(COLORS.coral);
  } else if (events.length) {
    for (const event of events.slice(0, 2)) {
      addEventLine(widget, event);
      widget.addSpacer(3);
    }
  } else {
    const none = widget.addText("今日の予定なし");
    none.font = font(16, "semibold");
    none.textColor = color(COLORS.faint);
  }

  addDivider(widget);

  addSectionLabel(widget, "checkmark.circle", taskResult?.stale ? "TASKS · 前回" : "TASKS", COLORS.green);
  widget.addSpacer(7);
  const tasks = tasksFromFeed(taskResult);
  if (taskResult?.needsSetup && !tasks.length) {
    const setup = widget.addText("Scriptableで1回だけタスク接続設定");
    setup.font = font(16, "semibold");
    setup.textColor = color(COLORS.coral);
  } else if (tasks.length) {
    const visibleTasks = tasks.slice(0, 3);
    for (let i = 0; i < visibleTasks.length; i++) {
      const task = visibleTasks[i];
      addTaskLine(widget, task, false);

      // When there is only one task, use otherwise-empty space for its concrete next step.
      // With multiple tasks, keep the layout compact so all actionable items remain visible.
      if (visibleTasks.length === 1 && task.nextAction) {
        widget.addSpacer(4);
        const action = widget.addText("次 → " + task.nextAction);
        action.font = font(14, "medium");
        action.textColor = color(COLORS.muted);
        action.lineLimit = 2;
        action.minimumScaleFactor = 0.9;
      }

      if (i < visibleTasks.length - 1) widget.addSpacer(8);
    }
  } else {
    const none = widget.addText("今やるタスクなし");
    none.font = font(14, "semibold");
    none.textColor = color(COLORS.faint);
  }

  addDivider(widget);

  const routineHead = widget.addStack();
  routineHead.layoutHorizontally();
  routineHead.centerAlignContent();
  addSectionLabel(routineHead, "arrow.triangle.2.circlepath", "ROUTINES", COLORS.gold);
  routineHead.addSpacer();
  const hint = routineHead.addText("タップで起動");
  hint.font = font(12, "medium");
  hint.textColor = color(COLORS.faint);

  widget.addSpacer(7);
  const routines = widget.addStack();
  routines.layoutHorizontally();
  routines.spacing = 7;
  addRoutineButton(routines, "Morning", "sunrise.fill", URLS.MORNING, COLORS.gold, COLORS.goldSoft);
  addRoutineButton(routines, "Night", "moon.stars.fill", URLS.NIGHT, "#7E7596", "#EAE6F0");
  routines.addSpacer();

  widget.addSpacer();
  const moneyRow = widget.addStack();
  moneyRow.layoutHorizontally();
  moneyRow.centerAlignContent();
  addSymbol(moneyRow, "yensign.circle.fill", 17, COLORS.blue);
  moneyRow.addSpacer(7);
  const label = moneyRow.addText("使えるお金");
  label.font = font(15, "semibold");
  label.textColor = color(COLORS.muted);
  moneyRow.addSpacer();
  const amount = moneyRow.addText(yen(money.amount));
  amount.font = font(22, "bold");
  amount.textColor = color(COLORS.blue);

  return widget;
}

async function promptToken() {
  const alert = new Alert();
  alert.title = "YOS Dashboard 接続";
  alert.message = "既存のYOS Tasks接続トークンを1回だけ保存します。Keychainに保存され、コードには残りません。";
  alert.addSecureTextField("接続トークン");
  alert.addAction("保存");
  alert.addCancelAction("キャンセル");
  const choice = await alert.presentAlert();
  if (choice === -1) return false;
  const token = clean(alert.textFieldValue(0), 512);
  if (token.length < 32) {
    const error = new Alert();
    error.title = "保存できません";
    error.message = "接続トークンが短すぎます。";
    error.addAction("OK");
    await error.presentAlert();
    return false;
  }
  Keychain.set(CONFIG.keychainKey, token);
  return true;
}

async function configureIfNeeded() {
  if (config.runsInWidget) return true;
  const hasToken = Keychain.contains(CONFIG.keychainKey) && clean(Keychain.get(CONFIG.keychainKey), 512);
  if (hasToken) return true;
  return await promptToken();
}

const shouldContinue = await configureIfNeeded();
if (shouldContinue === false) {
  Script.complete();
} else {
  const [taskResult, calendarResult, money] = await Promise.all([
    loadTaskFeed(),
    loadTodayEvents(),
    loadMoney(),
  ]);
  const key = PARAM === "TODAY" ? "TODAY" : "NOW";
  const widget = key === "TODAY" ? makeToday(taskResult, calendarResult, money) : makeNow(taskResult, calendarResult, money);

  if (config.runsInWidget) Script.setWidget(widget);
  else if (key === "TODAY") await widget.presentLarge();
  else await widget.presentMedium();
  Script.complete();
}
