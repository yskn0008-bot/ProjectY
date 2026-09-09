// MY WAY — 1 medium + 4 small widgets
// Scriptable
// Use the same script for all 5 widgets.
// Set Widget Parameter to one of: HOME / LIFE / MONEY / HJ / IDEA

const PARAM = (args.widgetParameter || "HOME").trim().toUpperCase();

const URLS = {
  HOME: "https://yskn0008-bot.github.io/ProjectY/yos/",
  LIFE: "https://yskn0008-bot.github.io/ProjectY/life/",
  MONEY: "https://yskn0008-bot.github.io/ProjectY/yos/#money",
  HJ: "https://yskn0008-bot.github.io/ProjectY/yos/#journey",
  IDEA: "https://yskn0008-bot.github.io/ProjectY/yos/#idea",
};

const DATA = {
  HOME: {
    title: "MY WAY",
    icon: "location.north.line",
    line1: "5領域はつながっている",
    line2: "Home → Life → Money → HJ → Idea",
    foot: "今日の一歩をここから選ぶ",
    accent: "#A98D45",
    bg: "#F6F0E5",
  },
  LIFE: {
    title: "Life",
    icon: "wave.3.right",
    line1: "今日の余白",
    line2: "MY WAYから表示",
    foot: "予定・タスク",
    accent: "#6E879E",
    bg: "#F4F0E8",
  },
  MONEY: {
    title: "Money",
    icon: "creditcard",
    line1: "今の余力",
    line2: "MY WAYから表示",
    foot: "支出・見通し",
    accent: "#A47C3B",
    bg: "#F4EFE6",
  },
  HJ: {
    title: "Hero’s Journey",
    icon: "mountain.2",
    line1: "今の現在地",
    line2: "MY WAYから表示",
    foot: "次に進む条件",
    accent: "#9B765F",
    bg: "#F4EEE8",
  },
  IDEA: {
    title: "Idea",
    icon: "lightbulb",
    line1: "最優先の1件",
    line2: "MY WAYから表示",
    foot: "次の一歩",
    accent: "#8D8D9F",
    bg: "#F2F0EA",
  },
};

const key = DATA[PARAM] ? PARAM : "HOME";
const cfg = DATA[key];

function font(size, weight = "regular") {
  if (weight === "bold") return Font.boldSystemFont(size);
  if (weight === "semibold") return Font.semiboldSystemFont(size);
  return Font.systemFont(size);
}

function addSymbol(stack, name, size, color) {
  const s = SFSymbol.named(name);
  s.applyFont(Font.systemFont(size));
  const img = stack.addImage(s.image);
  img.imageSize = new Size(size, size);
  img.tintColor = new Color(color);
  return img;
}

function addTopRule(parent, color) {
  const rule = parent.addStack();
  rule.size = new Size(42, 2);
  rule.backgroundColor = new Color(color, 0.75);
  rule.cornerRadius = 1;
}

function applyBackground(widget, cfg) {
  const g = new LinearGradient();
  g.locations = [0, 1];
  g.colors = [
    new Color(cfg.bg),
    new Color("#FBF8F1"),
  ];
  widget.backgroundGradient = g;
}

function makeHome() {
  const w = new ListWidget();
  applyBackground(w, cfg);
  w.setPadding(15, 17, 14, 17);
  w.url = URLS.HOME;

  const top = w.addStack();
  top.layoutHorizontally();
  addSymbol(top, cfg.icon, 17, cfg.accent);
  top.addSpacer(7);
  const t = top.addText(cfg.title);
  t.font = font(24, "bold");
  t.textColor = new Color("#2D2A27");
  top.addSpacer();

  const date = new DateFormatter();
  date.locale = "ja_JP";
  date.dateFormat = "M/d E";
  const d = top.addText(date.string(new Date()));
  d.font = font(11, "semibold");
  d.textColor = new Color("#7D776D");

  w.addSpacer(8);
  addTopRule(w, cfg.accent);
  w.addSpacer(8);

  const l1 = w.addText(cfg.line1);
  l1.font = font(14, "semibold");
  l1.textColor = new Color("#3A3732");
  l1.lineLimit = 1;

  w.addSpacer(4);

  const l2 = w.addText(cfg.line2);
  l2.font = font(12);
  l2.textColor = new Color("#6F695F");
  l2.lineLimit = 2;

  w.addSpacer();

  const foot = w.addStack();
  foot.layoutHorizontally();
  addSymbol(foot, "leaf", 13, "#65735B");
  foot.addSpacer(6);
  const f = foot.addText(cfg.foot);
  f.font = font(12, "semibold");
  f.textColor = new Color("#4E4B45");

  return w;
}

function makeSmall() {
  const w = new ListWidget();
  applyBackground(w, cfg);
  w.setPadding(13, 13, 12, 13);
  w.url = URLS[key];

  const top = w.addStack();
  top.layoutHorizontally();
  addSymbol(top, cfg.icon, 23, cfg.accent);
  top.addSpacer();

  w.addSpacer(7);

  const t = w.addText(cfg.title);
  t.font = font(key === "HJ" ? 15 : 19, "bold");
  t.textColor = new Color("#2F2C28");
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.72;

  w.addSpacer(5);
  addTopRule(w, cfg.accent);
  w.addSpacer(6);

  const l1 = w.addText(cfg.line1);
  l1.font = font(12, "semibold");
  l1.textColor = new Color("#4C4841");
  l1.lineLimit = 1;
  l1.minimumScaleFactor = 0.75;

  w.addSpacer(2);

  const l2 = w.addText(cfg.line2);
  l2.font = font(10);
  l2.textColor = new Color("#827A70");
  l2.lineLimit = 1;
  l2.minimumScaleFactor = 0.7;

  w.addSpacer();

  const f = w.addText(cfg.foot);
  f.font = font(9, "semibold");
  f.textColor = new Color(cfg.accent, 0.9);
  f.lineLimit = 1;

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
