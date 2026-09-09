// MY WAY Widget — approved image prototype v3
// Large widget only.
// Fix: removed root widget URL so each transparent tap zone can open its own destination.
// Background file: iCloud Drive / Scriptable / MY_WAY_Widget_BG.jpg

const URLS = {
  home: "https://yskn0008-bot.github.io/ProjectY/yos/",
  life: "https://yskn0008-bot.github.io/ProjectY/life/",
  money: "https://yskn0008-bot.github.io/ProjectY/yos/#money",
  journey: "https://yskn0008-bot.github.io/ProjectY/yos/#journey",
  idea: "https://yskn0008-bot.github.io/ProjectY/yos/#idea",
};

const fm = FileManager.iCloud();
const imagePath = fm.joinPath(
  fm.documentsDirectory(),
  "MY_WAY_Widget_BG.jpg"
);

if (!fm.fileExists(imagePath)) {
  const img = await Photos.fromLibrary();
  fm.writeImage(imagePath, img);
}

if (fm.isFileStoredIniCloud(imagePath)) {
  await fm.downloadFileFromiCloud(imagePath);
}

const bg = fm.readImage(imagePath);

function tapZone(parent, width, height, url) {
  const zone = parent.addStack();
  zone.size = new Size(width, height);
  zone.url = url;
  zone.backgroundColor = new Color("#FFFFFF", 0.001);
  zone.addSpacer();
  return zone;
}

const w = new ListWidget();
w.backgroundImage = bg;
w.setPadding(0, 0, 0, 0);
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

// IMPORTANT: no w.url here.
// Setting w.url would make the whole widget open Home and override the individual zones.

// Top / Home
w.addSpacer(92);

const homeRow = w.addStack();
homeRow.layoutHorizontally();
homeRow.addSpacer(112);
tapZone(homeRow, 115, 72, URLS.home);
homeRow.addSpacer();

w.addSpacer(4);

// Life / Idea
const midRow = w.addStack();
midRow.layoutHorizontally();
midRow.addSpacer(9);
tapZone(midRow, 110, 95, URLS.life);
midRow.addSpacer();
tapZone(midRow, 110, 95, URLS.idea);
midRow.addSpacer(9);

w.addSpacer(3);

// Money / Hero's Journey
const lowRow = w.addStack();
lowRow.layoutHorizontally();
lowRow.addSpacer(16);
tapZone(lowRow, 112, 85, URLS.money);
lowRow.addSpacer();
tapZone(lowRow, 142, 85, URLS.journey);
lowRow.addSpacer(12);

w.addSpacer();

// Bottom card: today's connection / today's step -> current target (Idea for prototype)
const bottom = w.addStack();
bottom.layoutHorizontally();
bottom.addSpacer(10);
tapZone(bottom, 310, 72, URLS.idea);
bottom.addSpacer(10);

w.addSpacer(8);

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentLarge();
}

Script.complete();
