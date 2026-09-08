// MY WAY Widget Prototype v1
// Standalone Scriptable widget. Does not modify ProjectY.
// Visual base: approved watercolor 5-domain concept.
// Current scope: visual/tap prototype + dynamic date/linkage/today-step overlay.
// Future scope: connect read-only MY WAY projection for live domain data.

const URLS = {
  home: "https://yskn0008-bot.github.io/ProjectY/yos/",
  life: "https://yskn0008-bot.github.io/ProjectY/life/",
  money: "https://yskn0008-bot.github.io/ProjectY/yos/#money",
  journey: "https://yskn0008-bot.github.io/ProjectY/yos/#journey",
  idea: "https://yskn0008-bot.github.io/ProjectY/yos/#idea",
};

const DEFAULT_STATE = {
  linkage: "Homeが整う → Lifeに余白 → Ideaが進む",
  todayStep: "ウィジェットを仕上げて、実機で使う",
  todayTarget: "idea",
};

const BG_BASE64 = "[BASE64_PLACEHOLDER]";

function jpDate(d = new Date()) {
  const weekdays = ["日","月","火","水","木","金","土"];
  return `${d.getMonth()+1}/${d.getDate()}(${weekdays[d.getDay()]})`;
}

function loadState() {
  try {
    const fm = FileManager.iCloud();
    const dir = fm.documentsDirectory();
    const p = fm.joinPath(dir, "MY_WAY_Widget_State.json");
    if (!fm.fileExists(p)) return DEFAULT_STATE;
    const raw = JSON.parse(fm.readString(p));
    return {
      linkage: typeof raw.linkage === "string" && raw.linkage.trim() ? raw.linkage.trim() : DEFAULT_STATE.linkage,
      todayStep: typeof raw.todayStep === "string" && raw.todayStep.trim() ? raw.todayStep.trim() : DEFAULT_STATE.todayStep,
      todayTarget: ["home","life","money","journey","idea"].includes(raw.todayTarget) ? raw.todayTarget : DEFAULT_STATE.todayTarget,
    };
  } catch (_) {
    return DEFAULT_STATE;
  }
}

function bgImage() {
  const data = Data.fromBase64String(BG_BASE64);
  return Image.fromData(data);
}

function invisibleTap(parent, width, height, url) {
  const s = parent.addStack();
  s.size = new Size(width, height);
  s.url = url;
  s.backgroundColor = new Color("#FFFFFF", 0.001);
  s.addSpacer();
  return s;
}

function text(parent, value, size, color, bold=false, lineLimit=1) {
  const t = parent.addText(value);
  t.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = lineLimit;
  t.minimumScaleFactor = 0.68;
  return t;
}

const state = loadState();
const w = new ListWidget();
w.backgroundImage = bgImage();
w.setPadding(0,0,0,0);
w.url = URLS.home;
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

const top = w.addStack();
top.size = new Size(0, 52);
top.layoutHorizontally();

const topLeft = top.addStack();
topLeft.size = new Size(205, 52);
topLeft.url = URLS.home;
topLeft.addSpacer();

top.addSpacer();

const dateCard = top.addStack();
dateCard.size = new Size(105, 48);
dateCard.layoutVertically();
dateCard.backgroundColor = new Color("#FAF6EC", 0.92);
dateCard.cornerRadius = 12;
dateCard.setPadding(6,8,5,8);
dateCard.url = URLS.home;
text(dateCard, jpDate(), 11.5, new Color("#183454"), true);
text(dateCard, "今日の現在地", 8.5, new Color("#59616B"), false);

const homeRow = w.addStack();
homeRow.size = new Size(0, 64);
homeRow.layoutHorizontally();
homeRow.addSpacer(102);
invisibleTap(homeRow, 125, 64, URLS.home);
homeRow.addSpacer();

const midRow = w.addStack();
midRow.size = new Size(0, 82);
midRow.layoutHorizontally();
invisibleTap(midRow, 125, 82, URLS.life);
midRow.addSpacer();
invisibleTap(midRow, 125, 82, URLS.idea);

const lowerRow = w.addStack();
lowerRow.size = new Size(0, 82);
lowerRow.layoutHorizontally();
invisibleTap(lowerRow, 132, 82, URLS.money);
lowerRow.addSpacer();
invisibleTap(lowerRow, 145, 82, URLS.journey);

w.addSpacer();

const bottom = w.addStack();
bottom.layoutVertically();
bottom.backgroundColor = new Color("#FFFDF8", 0.91);
bottom.cornerRadius = 16;
bottom.setPadding(7,10,8,10);
bottom.url = URLS[state.todayTarget] || URLS.home;

const labelRow = bottom.addStack();
labelRow.centerAlignContent();
text(labelRow, "今日のつながり", 8.5, new Color("#5C7A62"), true);
labelRow.addSpacer();
text(labelRow, "5領域", 7.5, new Color("#84827B"), false);

bottom.addSpacer(2);
text(bottom, state.linkage, 10.2, new Color("#25384A"), true, 1);

bottom.addSpacer(4);

const stepRow = bottom.addStack();
stepRow.centerAlignContent();
text(stepRow, "今日の一歩", 8.2, new Color("#7D806F"), false);
stepRow.addSpacer(6);
text(stepRow, state.todayStep, 9.4, new Color("#26394C"), true, 1);
stepRow.addSpacer();
text(stepRow, "›", 13, new Color("#68715E"), true);

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentLarge();
}

Script.complete();
