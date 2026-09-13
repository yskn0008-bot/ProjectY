// MY WAY by YOS — 1 medium + 4 small widgets
// Scriptable
// Same script for all 5 widgets.
// Widget Parameter: HOME / LIFE / MONEY / HJ / IDEA
// HOME reuses the private YOS Tasks widget feed and existing Keychain token.
// Small widgets are navigation/read surfaces only and do not expose private task data.

const PARAM = (args.widgetParameter || "HOME").trim().toUpperCase();

const CONFIG = {
  feedUrl: "https://project-y-yos-ai.vercel.app/api/yos/widget",
  keychainKey: "MY_WAY_WIDGET_TOKEN",
  cacheFile: "my-way-now-widget-cache-v1.json",
  refreshMinutes: 15,
};

const URLS = {
  HOME: "https://yskn0008-bot.github.io/ProjectY/yos/",
  LIFE: "https://yskn0008-bot.github.io/ProjectY/life/",
  MONEY: "https://yskn0008-bot.github.io/ProjectY/yos/#money",
  HJ: "https://yskn0008-bot.github.io/ProjectY/yos/#journey",
  IDEA: "https://yskn0008-bot.github.io/ProjectY/yos/#idea",
};

const THEMES = {
  HOME: {
    label: "MY WAY",
    icon: "location.north.fill",
    accent: "#A77D35",
    tint: "#F1E6C9",
    bg1: "#FAF4E7",
    bg2: "#F3EBDD",
  },
  LIFE: {
    label: "LIFE",
    jp: "暮らし",
    icon: "heart.fill",
    accent: "#6F9A86",
    tint: "#E4EFE9",
    bg1: "#F8F4EA",
    bg2: "#EEF3ED",
    focus: "今日を整える",
    sub: "予定・タスク・習慣",
    link: "HOME  ↔  LIFE",
  },
  MONEY: {
    label: "MONEY",
    jp: "お金",
    icon: "yensign.circle.fill",
    accent: "#4D8FAE",
    tint: "#DDEDF3",
    bg1: "#F8F4EA",
    bg2: "#EAF2F4",
    focus: "先を見通す",
    sub: "支払い・余力・目標",
    link: "LIFE  ↔  MONEY",
  },
  HJ: {
    label: "JOURNEY",
    jp: "旅",
    icon: "mountain.2.fill",
    accent: "#92725D",
    tint: "#EDE3DC",
    bg1: "#F8F3E9",
    bg2: "#F0E8E0",
    focus: "現在地を知る",
    sub: "経験・次に進む条件",
    link: "MONEY  ↔  JOURNEY",
  },
  IDEA: {
    label: "IDEA",
    jp: "ひらめき",
    icon: "lightbulb.fill",
    accent: "#8A829E",
    tint: "#E8E4EF",
    bg1: "#F8F4EA",
    bg2: "#F0EDF4",
    focus: "種を育てる",
    sub: "ひらめき・次の一歩",
    link: "JOURNEY  ↔  IDEA",
  },
};

const key = THEMES[PARAM] ? PARAM : "HOME";
const theme = THEMES[key];
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), CONFIG.cacheFile);

function c(hex, alpha = 1) { return new Color(hex, alpha); }
function font(size, weight = "regular") {
  if (weight === "bold") return Font.boldSystemFont(size);
  if (weight === "semibold") return Font.semiboldSystemFont(size);
  if (weight === "medium") return Font.mediumSystemFont(size);
  return Font.systemFont(size);
}

function cleanTitle(value) {
  return String(value || "").replace(/^\d{1,3}\s*[｜|]\s*/u, "").trim();
}

function readCache() {
  try {
    if (!fm.fileExists(cachePath)) return null;
    const parsed = JSON.parse(fm.readString(cachePath));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    fm.writeString(cachePath, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {}
}

async function fetchFeed(token) {
  const request = new Request(CONFIG.feedUrl);
  request.method = "GET";
  request.headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  request.timeoutInterval = 10;
  const data = await request.loadJSON();
  const status = Number(request.response?.statusCode || 0);
  if (status !== 200 || !data || typeof data !== "object") {
    throw new Error(`feed ${status}`);
  }
  writeCache(data);
  return { data, stale: false, needsSetup: false };
}

async function loadHomeFeed() {
  const cached = readCache();
  if (!Keychain.contains(CONFIG.keychainKey)) {
    return { data: cached?.data || null, stale: true, needsSetup: true };
  }
  const token = Keychain.get(CONFIG.keychainKey).trim();
  if (!token) {
    return { data: cached?.data || null, stale: true, needsSetup: true };
  }
  try {
    return await fetchFeed(token);
  } catch {
    return { data: cached?.data || null, stale: true, needsSetup: false };
  }
}

function addSymbol(parent, name, size, color) {
  const sf = SFSymbol.named(name);
  sf.applyFont(Font.systemFont(size));
  const img = parent.addImage(sf.image);
  img.imageSize = new Size(size, size);
  img.tintColor = c(color);
  return img;
}

function setBackground(widget, t) {
  const g = new LinearGradient();
  g.startPoint = new Point(0, 0);
  g.endPoint = new Point(1, 1);
  g.locations = [0, 0.58, 1];
  g.colors = [c(t.bg1), c("#FBF8F2"), c(t.bg2)];
  widget.backgroundGradient = g;
}

function addPill(parent, text, accent, fill, size = 11) {
  const pill = parent.addStack();
  pill.setPadding(6, 9, 6, 9);
  pill.backgroundColor = c(fill, 0.95);
  pill.cornerRadius = 12;
  const t = pill.addText(text);
  t.font = font(size, "semibold");
  t.textColor = c(accent);
  t.lineLimit = 1;
  return pill;
}

function addHomeLiveState(parent, result) {
  const task = result?.data?.task || null;

  const live = parent.addStack();
  live.layoutHorizontally();
  live.centerAlignContent();

  const left = live.addStack();
  left.layoutVertically();

  const label = left.addText(result?.stale ? "今やる • 前回" : "今やる");
  label.font = font(9, "bold");
  label.textColor = c(result?.stale ? "#8A7A61" : "#A77D35");

  let mainText = "今すぐやることなし";
  if (result?.needsSetup && !result?.data) mainText = "接続設定が必要";
  else if (task?.title) mainText = cleanTitle(task.title);

  const main = left.addText(mainText);
  main.font = font(14, "semibold");
  main.textColor = c("#35433E");
  main.lineLimit = 2;
  main.minimumScaleFactor = 0.78;

  if (task?.nextAction) {
    const next = left.addText(String(task.nextAction).trim());
    next.font = font(9, "medium");
    next.textColor = c("#77756E");
    next.lineLimit = 1;
    next.minimumScaleFactor = 0.75;
  }

  live.addSpacer();
  addPill(live, "OPEN", theme.accent, "#F1E6C9", 10);
}

function makeHome(result) {
  const w = new ListWidget();
  setBackground(w, theme);
  w.setPadding(15, 16, 14, 16);
  w.url = URLS.HOME;

  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();

  const mark = head.addStack();
  mark.size = new Size(34, 34);
  mark.backgroundColor = c(theme.tint);
  mark.cornerRadius = 17;
  mark.centerAlignContent();
  addSymbol(mark, theme.icon, 16, theme.accent);

  head.addSpacer(9);
  const headCopy = head.addStack();
  headCopy.layoutVertically();
  const eyebrow = headCopy.addText("MY WAY by YOS");
  eyebrow.font = font(10, "bold");
  eyebrow.textColor = c("#866A36");
  eyebrow.letterSpacing = 0.5;
  const title = headCopy.addText("自分の人生を、ひとつに。");
  title.font = font(16, "bold");
  title.textColor = c("#2D3935");

  head.addSpacer();
  const df = new DateFormatter();
  df.locale = "ja_JP";
  df.dateFormat = "M/d";
  const date = head.addText(df.string(new Date()));
  date.font = font(12, "semibold");
  date.textColor = c("#756D61");

  w.addSpacer(10);

  const flow = w.addStack();
  flow.layoutHorizontally();
  flow.spacing = 5;
  const domains = [
    ["HOME", "house.fill", "#6C806B", "#E7EEE5"],
    ["LIFE", "heart.fill", "#6F9A86", "#E4EFE9"],
    ["MONEY", "yensign", "#4D8FAE", "#DDEDF3"],
    ["JOURNEY", "mountain.2.fill", "#92725D", "#EDE3DC"],
    ["IDEA", "lightbulb.fill", "#8A829E", "#E8E4EF"],
  ];

  for (const [label, icon, accent, fill] of domains) {
    const card = flow.addStack();
    card.layoutVertically();
    card.centerAlignContent();
    card.setPadding(7, 6, 7, 6);
    card.backgroundColor = c(fill, 0.9);
    card.cornerRadius = 12;
    addSymbol(card, icon, 13, accent);
    card.addSpacer(4);
    const tx = card.addText(label);
    tx.font = font(label === "JOURNEY" ? 6.5 : 7.5, "bold");
    tx.textColor = c(accent);
    tx.lineLimit = 1;
    tx.minimumScaleFactor = 0.75;
  }

  w.addSpacer(10);
  addHomeLiveState(w, result);
  return w;
}

function makeSmall() {
  const w = new ListWidget();
  setBackground(w, theme);
  w.setPadding(13, 13, 12, 13);
  w.url = URLS[key];

  const top = w.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();

  const iconWrap = top.addStack();
  iconWrap.size = new Size(33, 33);
  iconWrap.backgroundColor = c(theme.tint, 0.98);
  iconWrap.cornerRadius = 16.5;
  iconWrap.centerAlignContent();
  addSymbol(iconWrap, theme.icon, 16, theme.accent);

  top.addSpacer();
  const jp = top.addText(theme.jp);
  jp.font = font(10, "semibold");
  jp.textColor = c(theme.accent);

  w.addSpacer(8);

  const label = w.addText(theme.label);
  label.font = font(key === "HJ" ? 15 : 18, "bold");
  label.textColor = c("#2E3734");
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.76;

  w.addSpacer(4);

  const focus = w.addText(theme.focus);
  focus.font = font(13, "bold");
  focus.textColor = c("#414A46");
  focus.lineLimit = 1;
  focus.minimumScaleFactor = 0.8;

  w.addSpacer(3);

  const sub = w.addText(theme.sub);
  sub.font = font(10, "medium");
  sub.textColor = c("#77756E");
  sub.lineLimit = 1;
  sub.minimumScaleFactor = 0.75;

  w.addSpacer();

  const link = w.addStack();
  link.layoutHorizontally();
  link.centerAlignContent();
  const dot = link.addStack();
  dot.size = new Size(6, 6);
  dot.backgroundColor = c(theme.accent);
  dot.cornerRadius = 3;
  link.addSpacer(5);
  const relation = link.addText(theme.link);
  relation.font = font(8.5, "bold");
  relation.textColor = c(theme.accent);
  relation.lineLimit = 1;
  relation.minimumScaleFactor = 0.72;

  return w;
}

async function promptToken() {
  const alert = new Alert();
  alert.title = "MY WAY Widget 接続";
  alert.message = "YOS_WIDGET_TOKENを1回だけ貼り付けます。iPhoneのKeychainに保存され、Widgetコードには残りません。";
  alert.addSecureTextField("接続トークン");
  alert.addAction("保存");
  alert.addCancelAction("キャンセル");
  const choice = await alert.presentAlert();
  if (choice === -1) return false;

  const token = alert.textFieldValue(0).trim();
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

async function configureHomeTokenIfNeeded() {
  if (key !== "HOME" || config.runsInWidget) return true;

  const hasToken =
    Keychain.contains(CONFIG.keychainKey) &&
    Keychain.get(CONFIG.keychainKey).trim();

  if (hasToken) return true;
  return await promptToken();
}

const shouldContinue = await configureHomeTokenIfNeeded();
if (shouldContinue === false) {
  Script.complete();
} else {
  const homeResult = key === "HOME" ? await loadHomeFeed() : null;
  const widget = key === "HOME" ? makeHome(homeResult) : makeSmall();
  widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    if (key === "HOME") await widget.presentMedium();
    else await widget.presentSmall();
  }

  Script.complete();
}
