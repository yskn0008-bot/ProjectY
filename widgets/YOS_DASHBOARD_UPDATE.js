// YOS Dashboard Updater
// One-tap updater for "YOS Dashboard v2".
// Resolves the current ProjectY main SHA first, then downloads the widget from that immutable commit.
// This avoids stale raw.githubusercontent.com main-branch caches.

const REPO = "yskn0008-bot/ProjectY";
const SOURCE_PATH = "widgets/YOS_DASHBOARD_WIDGET_v1.js";
const TARGET_NAME = "YOS Dashboard v2.js";
const BRANCH_API = "https://api.github.com/repos/" + REPO + "/branches/main";

async function loadJSON(url) {
  const request = new Request(url);
  request.timeoutInterval = 20;
  request.headers = {Accept: "application/vnd.github+json"};
  return await request.loadJSON();
}

async function loadText(url) {
  const request = new Request(url);
  request.timeoutInterval = 20;
  return await request.loadString();
}

function validateSource(source) {
  if (typeof source !== "string" || source.length < 5000) {
    throw new Error("Dashboardコードが短すぎるため停止しました。");
  }

  // Validate the stable Dashboard contract, not fragile UI implementation details.
  // This keeps the updater compatible with future typography/layout refinements.
  const required = [
    "// YOS Dashboard Widget v1",
    "args.widgetParameter",
    "function makeNow(",
    "function makeToday(",
    "loadTaskFeed()",
    "CalendarEvent.today()",
    "YOS/Money/money.json",
    "shortcuts://run-shortcut?name=",
  ];
  for (const marker of required) {
    if (!source.includes(marker)) throw new Error("Dashboard基本機能の検証に失敗: " + marker);
  }
}

function writeVerified(manager, source) {
  const path = manager.joinPath(manager.documentsDirectory(), TARGET_NAME);
  manager.writeString(path, source);
  if (!manager.fileExists(path)) throw new Error("保存に失敗: " + TARGET_NAME);
  const saved = manager.readString(path);
  if (saved !== source) throw new Error("保存後の検証に失敗: " + TARGET_NAME);
  return path;
}

const branch = await loadJSON(BRANCH_API);
const sha = String(branch?.commit?.sha || "").trim();
if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error("mainの最新コミットを取得できませんでした。");

const raw =
  "https://raw.githubusercontent.com/" +
  REPO +
  "/" +
  sha +
  "/" +
  SOURCE_PATH;

const source = await loadText(raw);
validateSource(source);

const results = [];
for (const manager of [FileManager.iCloud(), FileManager.local()]) {
  try {
    results.push(writeVerified(manager, source));
  } catch (error) {
    // One storage may be unavailable on a particular device. Require at least one verified write.
  }
}
if (!results.length) throw new Error("YOS Dashboard v2を保存できませんでした。");

const alert = new Alert();
alert.title = "YOS Dashboard 更新完了";
alert.message = "最新版 " + sha.slice(0, 7) + " を取得・検証して YOS Dashboard v2 を更新しました。";
alert.addAction("OK");
await alert.presentAlert();
Script.complete();
