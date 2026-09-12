// MY WAY by YOS — NOW Widget v1
// Scriptable
// Shows exactly one current task from the private YOS Tasks projection.

const CONFIG = {
  feedUrl: 'https://project-y-yos-ai.vercel.app/api/yos/widget',
  openUrl: 'https://yskn0008-bot.github.io/ProjectY/yos/',
  keychainKey: 'MY_WAY_WIDGET_TOKEN',
  cacheFile: 'my-way-now-widget-cache-v1.json',
  refreshMinutes: 15,
};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), CONFIG.cacheFile);

function color(hex, alpha = 1) { return new Color(hex, alpha); }
function font(size, weight = 'regular') {
  if (weight === 'bold') return Font.boldSystemFont(size);
  if (weight === 'semibold') return Font.semiboldSystemFont(size);
  return Font.systemFont(size);
}

function cleanTitle(value) {
  return String(value || '').replace(/^\d{1,3}\s*[｜|]\s*/u, '').trim();
}

function readCache() {
  try {
    if (!fm.fileExists(cachePath)) return null;
    const parsed = JSON.parse(fm.readString(cachePath));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function writeCache(data) {
  try { fm.writeString(cachePath, JSON.stringify({savedAt: Date.now(), data})); } catch {}
}

async function fetchFeed(token) {
  const request = new Request(CONFIG.feedUrl);
  request.method = 'GET';
  request.headers = {Authorization: `Bearer ${token}`, Accept: 'application/json'};
  request.timeoutInterval = 10;
  const data = await request.loadJSON();
  const status = Number(request.response?.statusCode || 0);
  if (status !== 200 || !data || typeof data !== 'object') throw new Error(`feed ${status}`);
  writeCache(data);
  return {data, stale: false};
}

async function loadFeed() {
  const cached = readCache();
  if (!Keychain.contains(CONFIG.keychainKey)) {
    return {data: cached?.data || null, stale: true, needsSetup: true};
  }
  const token = Keychain.get(CONFIG.keychainKey).trim();
  if (!token) return {data: cached?.data || null, stale: true, needsSetup: true};
  try { return await fetchFeed(token); }
  catch { return {data: cached?.data || null, stale: true, needsSetup: false}; }
}

function setBackground(widget) {
  const gradient = new LinearGradient();
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  gradient.locations = [0, 0.58, 1];
  gradient.colors = [color('#FAF4E7'), color('#FBF8F2'), color('#F3EBDD')];
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

function addHeader(widget, stale) {
  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  addSymbol(row, 'location.north.fill', 12, '#A77D35');
  row.addSpacer(6);
  const label = row.addText('MY WAY · NOW');
  label.font = font(9, 'bold');
  label.textColor = color('#866A36');
  label.letterSpacing = 0.5;
  row.addSpacer();
  if (stale) {
    const status = row.addText('前回');
    status.font = font(8, 'semibold');
    status.textColor = color('#8A7A61');
  }
}

function makeWidget(result) {
  const widget = new ListWidget();
  setBackground(widget);
  widget.setPadding(14, 15, 14, 15);
  widget.url = CONFIG.openUrl;
  widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);

  addHeader(widget, result.stale);
  widget.addSpacer(10);

  if (result.needsSetup && !result.data) {
    const title = widget.addText('接続設定が必要');
    title.font = font(16, 'bold');
    title.textColor = color('#2D3935');
    widget.addSpacer(5);
    const sub = widget.addText('Scriptableで一度だけ設定');
    sub.font = font(10, 'semibold');
    sub.textColor = color('#7A746A');
    return widget;
  }

  const task = result.data?.task || null;
  if (!task) {
    const quiet = widget.addText('今すぐやることなし');
    quiet.font = font(16, 'bold');
    quiet.textColor = color('#35433E');
    widget.addSpacer();
    const hint = widget.addText('必要な時だけMY WAYへ');
    hint.font = font(9, 'semibold');
    hint.textColor = color('#8A7A61');
    return widget;
  }

  const title = widget.addText(cleanTitle(task.title));
  title.font = font(config.widgetFamily === 'medium' ? 20 : 17, 'bold');
  title.textColor = color('#2D3935');
  title.lineLimit = config.widgetFamily === 'medium' ? 3 : 4;
  title.minimumScaleFactor = 0.72;

  if (config.widgetFamily === 'medium' && task.nextAction) {
    widget.addSpacer(7);
    const next = widget.addText(String(task.nextAction).trim());
    next.font = font(11, 'semibold');
    next.textColor = color('#6F6B63');
    next.lineLimit = 2;
    next.minimumScaleFactor = 0.8;
  }

  widget.addSpacer();
  const foot = widget.addStack();
  foot.layoutHorizontally();
  foot.centerAlignContent();
  const state = foot.addText(task.state === '本人操作' ? 'YOU' : 'NOW');
  state.font = font(8, 'bold');
  state.textColor = color('#A77D35');
  foot.addSpacer();
  addSymbol(foot, 'chevron.right', 8, '#A77D35');

  return widget;
}

async function configureTokenIfNeeded() {
  if (config.runsInWidget) return;
  const hasToken = Keychain.contains(CONFIG.keychainKey) && Keychain.get(CONFIG.keychainKey).trim();
  if (hasToken) {
    const menu = new Alert();
    menu.title = 'MY WAY Widget';
    menu.message = '現在の接続設定を使ってプレビューします。';
    menu.addAction('プレビュー');
    menu.addAction('接続トークンを変更');
    menu.addCancelAction('キャンセル');
    const choice = await menu.presentAlert();
    if (choice === -1) { Script.complete(); return false; }
    if (choice === 1) return await promptToken();
    return true;
  }
  return await promptToken();
}

async function promptToken() {
  const alert = new Alert();
  alert.title = 'MY WAY Widget 接続';
  alert.message = 'YOS_WIDGET_TOKENを1回だけ貼り付けます。iPhoneのKeychainに保存され、Widgetコードには残りません。';
  alert.addSecureTextField('接続トークン');
  alert.addAction('保存');
  alert.addCancelAction('キャンセル');
  const choice = await alert.presentAlert();
  if (choice === -1) return false;
  const token = alert.textFieldValue(0).trim();
  if (token.length < 32) {
    const error = new Alert();
    error.title = '保存できません';
    error.message = '接続トークンが短すぎます。';
    error.addAction('OK');
    await error.presentAlert();
    return false;
  }
  Keychain.set(CONFIG.keychainKey, token);
  return true;
}

const shouldContinue = await configureTokenIfNeeded();
if (shouldContinue === false) Script.complete();
else {
  const result = await loadFeed();
  const widget = makeWidget(result);
  if (config.runsInWidget) Script.setWidget(widget);
  else if (config.widgetFamily === 'medium') await widget.presentMedium();
  else await widget.presentSmall();
  Script.complete();
}
