const WEEKDAY_INDEX = Object.freeze({ 月: 0, 火: 1, 水: 2, 木: 3, 金: 4, 土: 5, 日: 6 });
const SHOPPING_WORDS = Object.freeze(['石鹸', 'せっけん', '洗剤', '牛乳', '卵', 'トイレットペーパー', 'ティッシュ']);

export function normalizeRawText(value) {
  if (typeof value !== 'string') throw new TypeError('入力内容が必要です。');
  const rawText = value.replace(/\r\n?/g, '\n').trim();
  if (!rawText) throw new Error('入力内容が必要です。');
  if (rawText.length > 10_000) throw new Error('一度に保存できる長さを超えています。');
  return rawText;
}

export function createRawCapture(rawText, inputMode = 'text', now = new Date(), captureID = crypto.randomUUID()) {
  if (!['voice', 'text'].includes(inputMode)) throw new Error('入力方法を確認してください。');
  return Object.freeze({
    captureID,
    schemaVersion: 1,
    rawText: normalizeRawText(rawText),
    capturedAt: now.toISOString(),
    inputMode,
    status: 'captured',
    classificationCandidate: null,
    parsedDateTime: null,
    target: null,
    confidence: null,
    appliedRecordID: null,
    applyAttemptID: null,
    lastErrorCode: null
  });
}

export function parseExplicitJapaneseDateTime(rawText, now = new Date()) {
  const match = rawText.match(/来週\s*([月火水木金土日])曜(?:日)?\s*(\d{1,2})時(?:\s*(\d{1,2})分)?\s*(.*)/u);
  if (!match) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3] || 0);
  const title = match[4].trim();
  if (hour > 23 || minute > 59 || !title) return null;

  const mondayOffset = (now.getDay() + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset + 7 + WEEKDAY_INDEX[match[1]], hour, minute, 0, 0);
  return {
    title,
    start: start.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
    allDay: false
  };
}

export function classifyCapture(record, now = new Date()) {
  const parsed = parseExplicitJapaneseDateTime(record.rawText, now);
  if (parsed) {
    return {
      ...record,
      status: 'classified',
      classificationCandidate: { target: 'calendar', label: '予定', confidence: 0.96 },
      parsedDateTime: { start: parsed.start, timeZone: parsed.timeZone, allDay: false },
      target: 'calendar',
      confidence: 0.96
    };
  }

  if (SHOPPING_WORDS.some(word => record.rawText.includes(word)) || /(?:買う|買って|購入)$/u.test(record.rawText)) {
    return {
      ...record,
      status: 'classified',
      classificationCandidate: { target: 'shopping', label: '買い物', confidence: 0.9 },
      target: 'shopping',
      confidence: 0.9
    };
  }

  const looksLikeDate = /(?:今日|明日|来週|月曜|火曜|水曜|木曜|金曜|土曜|日曜|\d{1,2}時)/u.test(record.rawText);
  return {
    ...record,
    status: 'needs_review',
    classificationCandidate: {
      target: looksLikeDate ? 'calendar' : 'memo',
      label: looksLikeDate ? '予定かもしれません' : '未整理',
      confidence: looksLikeDate ? 0.45 : 0.25
    },
    target: looksLikeDate ? 'calendar' : 'memo',
    confidence: looksLikeDate ? 0.45 : 0.25
  };
}

export async function captureRawFirst({ rawText, inputMode = 'text', store, classifier = classifyCapture, now = new Date(), captureID }) {
  if (!store?.append || !store?.replace) throw new Error('保存先を利用できません。');
  const raw = createRawCapture(rawText, inputMode, now, captureID);
  await store.append(raw);
  try {
    const classified = await classifier(raw, now);
    await store.replace(classified);
    return classified;
  } catch {
    return raw;
  }
}

export class NativeCaptureClient {
  constructor(plugin = globalThis.Capacitor?.Plugins?.YOSCapture) {
    this.plugin = plugin;
  }

  get available() {
    return Boolean(this.plugin?.capture && this.plugin?.list);
  }

  async capture(rawText, inputMode = 'text') {
    if (!this.available) throw new Error('YOS iOSアプリで開いてください。');
    const result = await this.plugin.capture({ rawText: normalizeRawText(rawText), inputMode });
    return result.record;
  }

  async list(limit = 20) {
    if (!this.available) return { records: [], storageScope: 'unavailable' };
    return this.plugin.list({ limit });
  }
}
