// MY WAY by YOS — 1 medium + 4 small widgets
// Scriptable
// Same script for all 5 widgets.
// Widget Parameter: HOME / LIFE / MONEY / HJ / IDEA

const PARAM = (args.widgetParameter || "HOME").trim().toUpperCase();

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

function c(hex, alpha = 1) { return new Color(hex, alpha); }
function font(size, weight = "regular") {
  if (weight === "bold") return Font.boldSystemFont(size);
  if (weight === "semibold") return Font.semiboldSystemFont(size);
  if (weight === "medium") return Font.mediumSystemFont(size);
  return Font.systemFont(size);
}

function symbol(name, size, color) {
  const sf = SFSymbol.named(name);
  sf.applyFont(Font.systemFont(size));
  const image = sf.image;
  const stack = new StackPlaceholder();
  return { image, size, color };
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

function makeHome() {
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

  const bottom = w.addStack();
  bottom.layoutHorizontally();
  bottom.centerAlignContent();
  const left = bottom.addStack();
  left.layoutVertically();
  const small = left.addText("5 AREAS • ONE LIFE");
  small.font = font(9, "bold");
  small.textColor = c("#8A7A61");
  const main = left.addText("今ここ → 次の一歩");
  main.font = font(14, "semibold");
  main.textColor = c("#35433E");
  bottom.addSpacer();
  addPill(bottom, "OPEN", theme.accent, "#F1E6C9", 10);

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

let widget = key === "HOME" ? makeHome() : makeSmall();
widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  if (key === "HOME") await widget.presentMedium();
  else await widget.presentSmall();
}

Script.complete();
