// MY WAY Widget — Scriptable Prototype v2
// Large widget only.
// Role: MY WAY is the source of truth; this widget is the "window"
// that shows how the five areas are connected.
// This prototype is self-contained and read-only.

const URLS = {
  home: "https://yskn0008-bot.github.io/ProjectY/yos/",
  life: "https://yskn0008-bot.github.io/ProjectY/life/",
  money: "https://yskn0008-bot.github.io/ProjectY/yos/#money",
  journey: "https://yskn0008-bot.github.io/ProjectY/yos/#journey",
  idea: "https://yskn0008-bot.github.io/ProjectY/yos/#idea",
};

const STATE = {
  home: { title: "Home", icon: "house.fill", line1: "環境を整える", line2: "集中できる空間 ◎" },
  life: { title: "Life", icon: "calendar", line1: "今日の予定", line2: "残り2件・余白2h" },
  idea: { title: "Idea", icon: "lightbulb.fill", line1: "最優先", line2: "ウィジェット完成へ" },
  money: { title: "Money", icon: "yensign.circle.fill", line1: "今の余力", line2: "本体参照予定" },
  journey: { title: "Hero’s Journey", icon: "flag.fill", line1: "2026｜土台を整える", line2: "次：小さく前進" },
  linkage: "Homeが整う → Lifeに余白 → Ideaが進む",
  todayStep: "ウィジェットを仕上げて、実機で使う",
  todayTarget: "idea",
};

const C = {
  paper: new Color("#F8F2E6"),
  ink: new Color("#17324E"),
  muted: new Color("#6F746F"),
  gold: new Color("#D6A63F"),
  goldSoft: new Color("#F3E4AF", 0.92),
  green: new Color("#7EA26F"),
  greenSoft: new Color("#DDE9D2", 0.93),
  blue: new Color("#5F8695"),
  blueSoft: new Color("#D9E9EF", 0.93),
  coral: new Color("#A96E57"),
  coralSoft: new Color("#F1DDD2", 0.93),
  grayBlue: new Color("#738390"),
  grayBlueSoft: new Color("#E1E5E7", 0.93),
  whiteGlass: new Color("#FFFDF8", 0.90),
  route: new Color("#D9B65D", 0.82),
};

function jpDate(d = new Date()) {
  const wd = ["日","月","火","水","木","金","土"];
  return `${d.getMonth()+1}/${d.getDate()}(${wd[d.getDay()]})`;
}

function addText(parent, value, size, color, weight="regular", lines=1, center=false) {
  const t = parent.addText(value);
  t.font =
    weight === "bold" ? Font.boldSystemFont(size) :
    weight === "semibold" ? Font.semiboldSystemFont(size) :
    Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = lines;
  t.minimumScaleFactor = 0.72;
  if (center) t.centerAlignText();
  return t;
}

function sf(name, color, size) {
  const s = SFSymbol.named(name) || SFSymbol.named("circle.fill");
  s.applyFont(Font.systemFont(size));
  return { image: s.image, color };
}

function makeBackground() {
  const ctx = new DrawContext();
  ctx.size = new Size(1000, 1000);
  ctx.opaque = true;
  ctx.respectScreenScale = false;

  ctx.setFillColor(C.paper);
  ctx.fillRect(new Rect(0,0,1000,1000));

  const washes = [
    [160, 165, 380, 250, "#DCEEEB", 0.50],
    [535, 150, 360, 260, "#F7E0B2", 0.45],
    [80, 410, 310, 300, "#D7E7F0", 0.54],
    [600, 420, 300, 300, "#F2D9CF", 0.52],
    [290, 535, 330, 300, "#E8E1B9", 0.42],
  ];
  for (const [x,y,w,h,hex,a] of washes) {
    ctx.setFillColor(new Color(hex,a));
    ctx.fillEllipse(new Rect(x,y,w,h));
  }

  const m1 = new Path();
  m1.move(new Point(0,360));
  m1.addLine(new Point(120,270));
  m1.addLine(new Point(225,335));
  m1.addLine(new Point(350,235));
  m1.addLine(new Point(470,325));
  m1.addLine(new Point(610,245));
  m1.addLine(new Point(760,330));
  m1.addLine(new Point(900,260));
  m1.addLine(new Point(1000,340));
  m1.addLine(new Point(1000,520));
  m1.addLine(new Point(0,520));
  m1.closeSubpath();
  ctx.addPath(m1);
  ctx.setFillColor(new Color("#AFC9C2",0.42));
  ctx.fillPath();

  const m2 = new Path();
  m2.move(new Point(0,430));
  m2.addCurve(new Point(180,350), new Point(330,430), new Point(500,360));
  m2.addCurve(new Point(650,300), new Point(780,390), new Point(1000,330));
  m2.addLine(new Point(1000,610));
  m2.addLine(new Point(0,610));
  m2.closeSubpath();
  ctx.addPath(m2);
  ctx.setFillColor(new Color("#7EA18C",0.30));
  ctx.fillPath();

  ctx.setFillColor(new Color("#F3BE50",0.63));
  ctx.fillEllipse(new Rect(790,285,120,120));

  const route = new Path();
  route.move(new Point(485,250));
  route.addCurve(new Point(560,315), new Point(545,410), new Point(495,475));
  route.addCurve(new Point(435,555), new Point(540,610), new Point(590,690));
  route.addCurve(new Point(650,790), new Point(520,850), new Point(430,940));
  ctx.addPath(route);
  ctx.setStrokeColor(new Color("#E3BD58",0.56));
  ctx.setLineWidth(26);
  ctx.strokePath();

  const link = new Path();
  link.move(new Point(500,325));
  link.addCurve(new Point(350,355), new Point(245,425), new Point(220,515));
  link.move(new Point(500,325));
  link.addCurve(new Point(640,360), new Point(760,425), new Point(790,515));
  link.move(new Point(220,515));
  link.addCurve(new Point(205,630), new Point(255,720), new Point(300,760));
  link.move(new Point(790,515));
  link.addCurve(new Point(790,630), new Point(745,705), new Point(700,760));
  link.move(new Point(300,760));
  link.addCurve(new Point(430,815), new Point(565,815), new Point(700,760));
  ctx.addPath(link);
  ctx.setStrokeColor(new Color("#D0A94C",0.46));
  ctx.setLineWidth(9);
  ctx.strokePath();

  const dots = [
    [60,610],[100,650],[130,630],[170,680],[215,645],[840,630],[885,650],[930,615],
    [70,760],[120,790],[900,760],[950,800],[230,850],[780,860],[500,905]
  ];
  for (let i=0;i<dots.length;i++) {
    const [x,y]=dots[i];
    ctx.setFillColor(new Color(i%2 ? "#7FA17A" : "#A5B98C", 0.45));
    ctx.fillEllipse(new Rect(x,y,36,24));
  }

  return ctx.getImage();
}

function domainBubble(parent, domain, tint, bg, url, width, height, titleSize=11.5) {
  const card = parent.addStack();
  card.layoutVertically();
  card.size = new Size(width,height);
  card.backgroundColor = bg;
  card.cornerRadius = Math.min(width,height)/2.6;
  card.setPadding(8,8,7,8);
  card.url = url;

  const iconWrap = card.addStack();
  iconWrap.centerAlignContent();
  iconWrap.addSpacer();
  const s = sf(domain.icon, tint, 14);
  const img = iconWrap.addImage(s.image);
  img.tintColor = s.color;
  img.imageSize = new Size(16,16);
  iconWrap.addSpacer();

  card.addSpacer(2);
  addText(card, domain.title, titleSize, C.ink, "semibold", 1, true);
  card.addSpacer(2);
  addText(card, domain.line1, 8.4, C.ink, "semibold", 1, true);
  addText(card, domain.line2, 7.6, C.muted, "regular", 1, true);

  return card;
}

const w = new ListWidget();
w.backgroundImage = makeBackground();
w.setPadding(10,10,10,10);
w.url = URLS.home;
w.refreshAfterDate = new Date(Date.now()+30*60*1000);

const header = w.addStack();
header.centerAlignContent();

const brand = header.addStack();
brand.layoutVertically();
brand.url = URLS.home;
addText(brand,"MY WAY",20,C.ink,"bold");
addText(brand,"今日も、自分の道を進もう。",8.2,C.muted,"regular");

header.addSpacer();

const today = header.addStack();
today.layoutVertically();
today.backgroundColor = new Color("#FFFDF8",0.82);
today.cornerRadius = 12;
today.setPadding(5,8,5,8);
today.url = URLS.home;
addText(today,jpDate(),11,C.ink,"semibold");
addText(today,"今日の現在地",7.8,C.muted);

w.addSpacer(4);

const topRow = w.addStack();
topRow.layoutHorizontally();
topRow.addSpacer();
domainBubble(topRow, STATE.home, C.green, C.greenSoft, URLS.home, 118, 82, 12);
topRow.addSpacer();

w.addSpacer(3);

const midRow = w.addStack();
midRow.layoutHorizontally();
domainBubble(midRow, STATE.life, C.blue, C.blueSoft, URLS.life, 102, 88, 11.5);
midRow.addSpacer(4);

const center = midRow.addStack();
center.layoutVertically();
center.size = new Size(94,88);
center.backgroundColor = new Color("#FFF8E8",0.83);
center.cornerRadius = 44;
center.setPadding(16,7,8,7);
center.url = URLS.home;
addText(center,"すべては",9,C.gold,"semibold",1,true);
addText(center,"つながっている",9,C.gold,"semibold",1,true);
center.addSpacer();
const ar = sf("arrow.triangle.2.circlepath", C.gold, 11);
const arw = center.addImage(ar.image);
arw.tintColor = ar.color;
arw.imageSize = new Size(15,15);
center.centerAlignContent();

midRow.addSpacer(4);
domainBubble(midRow, STATE.idea, C.coral, C.coralSoft, URLS.idea, 102, 88, 11.5);

w.addSpacer(3);

const lowRow = w.addStack();
lowRow.layoutHorizontally();
lowRow.addSpacer(10);
domainBubble(lowRow, STATE.money, new Color("#9B7734"), C.goldSoft, URLS.money, 112, 82, 11.2);
lowRow.addSpacer();
domainBubble(lowRow, STATE.journey, C.grayBlue, C.grayBlueSoft, URLS.journey, 138, 82, 10.1);
lowRow.addSpacer(10);

w.addSpacer(6);

const info = w.addStack();
info.layoutVertically();
info.backgroundColor = C.whiteGlass;
info.cornerRadius = 15;
info.setPadding(7,9,7,9);
info.url = URLS[STATE.todayTarget] || URLS.home;

const infoHead = info.addStack();
infoHead.centerAlignContent();
const linkIcon = sf("link", C.green, 10);
const li = infoHead.addImage(linkIcon.image);
li.tintColor = linkIcon.color;
li.imageSize = new Size(12,12);
infoHead.addSpacer(5);
addText(infoHead,"今日のつながり",8.3,C.ink,"semibold");
infoHead.addSpacer();

info.addSpacer(2);
addText(info,STATE.linkage,9.5,C.ink,"semibold",1);

info.addSpacer(4);
const step = info.addStack();
step.centerAlignContent();
addText(step,"だから、今日の一歩",7.8,C.muted,"regular");
step.addSpacer(6);
addText(step,STATE.todayStep,8.8,C.ink,"semibold",1);
step.addSpacer();
addText(step,"›",13,C.green,"bold");

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentLarge();
}
Script.complete();
