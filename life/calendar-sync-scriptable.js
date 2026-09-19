// YOS Life Calendar Sync
// Scriptable bridge: iPhone Calendar -> MY LIFE ?sync= URL

const LIFE_URL = 'https://yskn0008-bot.github.io/ProjectY/life/?sync=';

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function iso(date) {
  return new Date(date).toISOString();
}

function base64Url(text) {
  return Data.fromString(text)
    .toBase64String()
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function run() {
  const now = new Date();
  const events = await CalendarEvent.today();
  if (localDateKey(now) !== localDateKey(new Date())) {
    throw new Error("日付が変わりました。もう一度実行してください。");
  }
  const normalized = events
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .map((event, index) => ({
      id: String(event.identifier || `scriptable-${index}`),
      title: String(event.title || '予定'),
      start: iso(event.startDate),
      end: iso(event.endDate),
      location: String(event.location || ''),
      category: 'other',
      isAllDay: event.isAllDay === true,
    }));

  const payload = { date: localDateKey(now), events: normalized };
  const url = `${LIFE_URL}${base64Url(JSON.stringify(payload))}`;
  Safari.open(url);

  // URLを開いただけではLifeでの保存成功を確認できないため、成功通知は出さない。

}

try {
  await run();
} catch (error) {
  const alert = new Alert();
  alert.title = 'カレンダー同期に失敗';
  alert.message = String(error && error.message ? error.message : error);
  alert.addAction('閉じる');
  await alert.presentAlert();
}

Script.complete();
