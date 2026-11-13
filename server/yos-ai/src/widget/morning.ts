import type {FetchLike} from '../http.js';
import type {TaskDashboardItem} from '../tasks/handler.js';
import {loadNotionTaskDashboard} from './notion-source.js';
import {selectWidgetFeed, type WidgetTask} from './selection.js';

const NOTION_VERSION = '2026-03-11';
const BALANCE_SOURCE_TITLE = '残高スナップショット';
const EVENTS_SOURCE_TITLE = '家計イベント・入出金予定';
const TZ = 'Asia/Tokyo';
const MAX_PAGES = 5;
const PAGE_SIZE = 100;

type VerificationState = 'confirmed' | 'unconfirmed';

export interface MorningAlertItem {
  title: string;
  due: string | null;
  amount: number | null;
  nextAction: string;
  source: 'YOS Tasks' | '家計イベント・入出金予定';
}

export interface MorningMoneyEvent {
  title: string;
  date: string;
  amount: number;
}

export interface MorningMoneyProjection {
  status: VerificationState;
  asOf: string | null;
  currentUsable: number | null;
  nextIncome: MorningMoneyEvent | null;
  nextPayment: MorningMoneyEvent | null;
  safetyToNextIncome: 'warning' | 'unconfirmed';
  sevenDayWarning: MorningMoneyEvent | null;
  reason: string;
}

export interface MorningBriefProjection {
  schema: 'yos-morning-brief-v1';
  generatedAt: string | null;
  nowStatus: VerificationState;
  sourceState: 'active' | 'next' | 'empty';
  now: WidgetTask | null;
  alerts: {
    status: VerificationState;
    count: number | null;
    item: MorningAlertItem | null;
  };
  money: MorningMoneyProjection;
}

export interface LoadNotionMorningBriefOptions {
  notionToken: string;
  notionTasksDataSourceId?: string;
  fetchImpl?: FetchLike;
  now?: Date;
}

interface BalanceRow {
  assetClass: string;
  amount: number | null;
  usable: boolean;
  verification: string;
  confirmedDate: string | null;
}

interface MoneyEventRow extends MorningMoneyEvent {
  kind: 'income' | 'payment' | 'transfer';
  state: string;
  verification: string;
  lastEditedAt: string | null;
}

export async function loadNotionMorningBrief(
  options: LoadNotionMorningBriefOptions
): Promise<MorningBriefProjection> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const tasks = await loadNotionTaskDashboard({
    notionToken: options.notionToken,
    ...(options.notionTasksDataSourceId?.trim()
      ? {notionDataSourceId: options.notionTasksDataSourceId.trim()}
      : {}),
    fetchImpl
  });
  const widget = selectWidgetFeed(tasks.tasks, tasks.generatedAt);

  let money: MorningMoneyProjection;
  let moneySourceAvailable = true;
  try {
    money = await loadMorningMoney({
      notionToken: options.notionToken,
      fetchImpl,
      now
    });
  } catch (error) {
    moneySourceAvailable = false;
    money = unconfirmedMoney(classifyMoneySourceFailure(error));
  }

  const alertItems: Array<MorningAlertItem & {rank: number}> = [];
  for (const task of selectFreshTaskAlerts(tasks.tasks, now)) {
    alertItems.push({
      title: task.title,
      due: task.due,
      amount: null,
      nextAction: task.nextAction,
      source: 'YOS Tasks',
      rank: task.priority === 'P0' ? 1 : 2
    });
  }

  if (money.sevenDayWarning && daysBetween(tokyoDateKey(now), money.sevenDayWarning.date) <= 1) {
    alertItems.push({
      title: money.sevenDayWarning.title,
      due: money.sevenDayWarning.date,
      amount: money.sevenDayWarning.amount,
      nextAction: '支払状況を確認',
      source: '家計イベント・入出金予定',
      rank: 0
    });
  }

  alertItems.sort((a, b) => a.rank - b.rank || compareNullableDate(a.due, b.due));
  const firstAlert = alertItems[0] ?? null;

  return {
    schema: 'yos-morning-brief-v1',
    generatedAt: tasks.generatedAt,
    nowStatus: 'confirmed',
    sourceState: widget.sourceState,
    now: widget.task,
    alerts: {
      status: moneySourceAvailable ? 'confirmed' : 'unconfirmed',
      count: moneySourceAvailable ? alertItems.length : (alertItems.length || null),
      item: firstAlert ? {
        title: firstAlert.title,
        due: firstAlert.due,
        amount: firstAlert.amount,
        nextAction: firstAlert.nextAction,
        source: firstAlert.source
      } : null
    },
    money
  };
}

export function unavailableMorningBrief(reason = 'notion-source-unavailable'): MorningBriefProjection {
  return {
    schema: 'yos-morning-brief-v1',
    generatedAt: null,
    nowStatus: 'unconfirmed',
    sourceState: 'empty',
    now: null,
    alerts: {status: 'unconfirmed', count: null, item: null},
    money: unconfirmedMoney(reason)
  };
}

async function loadMorningMoney(options: {
  notionToken: string;
  fetchImpl: FetchLike;
  now: Date;
}): Promise<MorningMoneyProjection> {
  const token = required(options.notionToken, 'Notion token');
  const [balanceId, eventsId] = await Promise.all([
    resolveDataSourceIdByTitle(token, BALANCE_SOURCE_TITLE, options.fetchImpl),
    resolveDataSourceIdByTitle(token, EVENTS_SOURCE_TITLE, options.fetchImpl)
  ]);
  const [balancePages, eventPages] = await Promise.all([
    queryDataSource(options.fetchImpl, token, balanceId),
    queryDataSource(options.fetchImpl, token, eventsId)
  ]);

  const today = tokyoDateKey(options.now);
  const balances = balancePages.map(parseBalanceRow).filter((value): value is BalanceRow => value !== null);
  const relevantBalances = balances.filter((row) => row.assetClass !== '借入');
  const usableRows = relevantBalances.filter((row) => row.usable);
  const balancesFresh = usableRows.length > 0
    && usableRows.every((row) =>
      row.verification !== '未確認'
      && row.amount !== null
      && row.confirmedDate === today
    );
  const currentUsable = balancesFresh
    ? usableRows.reduce((sum, row) => sum + (row.amount ?? 0), 0)
    : null;
  const asOf = latestDate(relevantBalances.map((row) => row.confirmedDate));

  const events = eventPages.map(parseMoneyEvent).filter((value): value is MoneyEventRow => value !== null);
  const pending = events
    .filter((event) => event.state === '予定' && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const confirmed = pending.filter((event) =>
    event.verification === '確認済' && isFreshTimestamp(event.lastEditedAt, options.now, 7)
  );
  const nextIncomeRow = confirmed.find((event) => event.kind === 'income') ?? null;
  const nextPaymentRow = confirmed.find((event) => event.kind === 'payment') ?? null;
  const sevenDayWarningRow = confirmed.find((event) =>
    event.kind === 'payment'
    && daysBetween(today, event.date) >= 0
    && daysBetween(today, event.date) <= 7
  ) ?? null;

  const nextIncome = toPublicMoneyEvent(nextIncomeRow);
  const nextPayment = toPublicMoneyEvent(nextPaymentRow);
  const sevenDayWarning = toPublicMoneyEvent(sevenDayWarningRow);

  let safetyToNextIncome: MorningMoneyProjection['safetyToNextIncome'] = 'unconfirmed';
  if (currentUsable !== null && nextIncomeRow) {
    const untilIncome = pending.filter((event) => event.date <= nextIncomeRow.date && event.kind === 'payment');
    const allOutgoingsConfirmed = untilIncome.every((event) =>
      event.verification === '確認済' && isFreshTimestamp(event.lastEditedAt, options.now, 7)
    );
    if (allOutgoingsConfirmed) {
      const outgoing = untilIncome.reduce((sum, event) => sum + event.amount, 0);
      if (outgoing > currentUsable) safetyToNextIncome = 'warning';
    }
  }

  const reasons: string[] = [];
  if (currentUsable === null) reasons.push('current-usable-unconfirmed');
  if (!nextIncome) reasons.push('next-income-unconfirmed');
  if (safetyToNextIncome === 'unconfirmed') reasons.push('cash-gap-unconfirmed');

  return {
    status: currentUsable !== null ? 'confirmed' : 'unconfirmed',
    asOf,
    currentUsable,
    nextIncome,
    nextPayment,
    safetyToNextIncome,
    sevenDayWarning,
    reason: reasons.join(',') || 'confirmed'
  };
}

function selectFreshTaskAlerts(tasks: TaskDashboardItem[], now: Date): TaskDashboardItem[] {
  return tasks
    .filter((task) => task.state === '本人操作' && (task.priority === 'P0' || task.priority === 'P1'))
    .filter((task) => isFreshTimestamp(task.lastSynced ?? null, now, 7))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)
      || compareNullableDate(a.due, b.due)
      || a.order - b.order);
}

function priorityRank(priority: string): number {
  if (priority === 'P0') return 0;
  if (priority === 'P1') return 1;
  return 9;
}

function parseBalanceRow(value: unknown): BalanceRow | null {
  if (!isRecord(value) || !isRecord(value.properties)) return null;
  const p = value.properties;
  return {
    assetClass: selectProperty(p['資産区分']),
    amount: numberProperty(p['金額']),
    usable: checkboxProperty(p['すぐ使える']),
    verification: selectProperty(p['確認状況']),
    confirmedDate: dateKey(dateProperty(p['確認日']))
  };
}

function parseMoneyEvent(value: unknown): MoneyEventRow | null {
  if (!isRecord(value) || !isRecord(value.properties)) return null;
  const p = value.properties;
  const title = textProperty(p['項目'], 'title', 120);
  const rawDate = dateProperty(p['日付']);
  const normalizedDate = dateKey(rawDate);
  const amount = numberProperty(p['金額']);
  if (!title || !normalizedDate || amount === null || amount < 0) return null;
  const section = selectProperty(p['区分']);
  const kind = section === '収入' ? 'income' : section === '支出' ? 'payment' : 'transfer';
  return {
    title,
    date: normalizedDate,
    amount,
    kind,
    state: selectProperty(p['状態']),
    verification: selectProperty(p['確度']),
    lastEditedAt: typeof value.last_edited_time === 'string' ? value.last_edited_time : null
  };
}

function toPublicMoneyEvent(value: MoneyEventRow | null): MorningMoneyEvent | null {
  return value ? {title: value.title, date: value.date, amount: value.amount} : null;
}

// Only expose fixed diagnostic codes. Never return tokens, request bodies, or Notion URLs.
function classifyMoneySourceFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const status = /^Notion request failed: (\\d{3})$/.exec(message)?.[1];
  if (status === '401' || status === '403') return 'notion-money-auth-or-access-denied';
  if (status === '404') return 'notion-money-resource-not-found';
  if (status === '429') return 'notion-money-rate-limited';
  if (status && Number(status) >= 500) return 'notion-money-service-unavailable';
  if (message.startsWith('Expected exactly one Notion data source')) return 'notion-money-source-resolution-failed';
  return 'notion-money-fetch-failed';
}

function unconfirmedMoney(reason: string): MorningMoneyProjection {
  return {
    status: 'unconfirmed',
    asOf: null,
    currentUsable: null,
    nextIncome: null,
    nextPayment: null,
    safetyToNextIncome: 'unconfirmed',
    sevenDayWarning: null,
    reason
  };
}

async function resolveDataSourceIdByTitle(
  notionToken: string,
  title: string,
  fetchImpl: FetchLike
): Promise<string> {
  const payload = await notionRequest(
    fetchImpl,
    notionToken,
    'https://api.notion.com/v1/search',
    {
      method: 'POST',
      body: JSON.stringify({
        query: title,
        filter: {property: 'object', value: 'data_source'},
        page_size: 100
      })
    }
  );
  const results = Array.isArray(payload.results) ? payload.results : [];
  const matches = results.filter((entry) =>
    isRecord(entry)
    && entry.object === 'data_source'
    && notionTitle(entry.title) === title
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one Notion data source titled "${title}", found ${matches.length}`);
  }
  return normalizeId(String(matches[0]?.id ?? ''), `${title} data source ID`);
}

async function queryDataSource(
  fetchImpl: FetchLike,
  notionToken: string,
  dataSourceId: string
): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  let cursor: string | null = null;
  let page = 0;
  do {
    const body: Record<string, unknown> = {page_size: PAGE_SIZE};
    if (cursor) body.start_cursor = cursor;
    const payload = await notionRequest(
      fetchImpl,
      notionToken,
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {method: 'POST', body: JSON.stringify(body)}
    );
    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const row of results) if (isRecord(row)) rows.push(row);
    cursor = payload.has_more === true && typeof payload.next_cursor === 'string'
      ? payload.next_cursor
      : null;
    page += 1;
  } while (cursor && page < MAX_PAGES);
  return rows;
}

async function notionRequest(
  fetchImpl: FetchLike,
  notionToken: string,
  url: string,
  init: {method: string; body: string}
): Promise<Record<string, any>> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION
    }
  });
  if (!response.ok) throw new Error(`Notion request failed: ${response.status}`);
  const payload = await response.json();
  if (!isRecord(payload)) throw new Error('Notion returned invalid JSON');
  return payload;
}

function textProperty(value: unknown, key: 'title' | 'rich_text', max: number): string {
  if (!isRecord(value) || !Array.isArray(value[key])) return '';
  return value[key].map((part) => {
    if (!isRecord(part)) return '';
    if (typeof part.plain_text === 'string') return part.plain_text;
    if (isRecord(part.text) && typeof part.text.content === 'string') return part.text.content;
    return '';
  }).join('').replace(/[\u0000-\u001F\u007F]/gu, ' ').trim().slice(0, max);
}

function selectProperty(value: unknown): string {
  return isRecord(value) && isRecord(value.select) && typeof value.select.name === 'string'
    ? value.select.name.trim().slice(0, 80)
    : '';
}

function numberProperty(value: unknown): number | null {
  return isRecord(value) && typeof value.number === 'number' && Number.isFinite(value.number)
    ? value.number
    : null;
}

function checkboxProperty(value: unknown): boolean {
  return isRecord(value) && value.checkbox === true;
}

function dateProperty(value: unknown): string | null {
  return isRecord(value) && isRecord(value.date) && typeof value.date.start === 'string'
    ? value.date.start
    : null;
}

function notionTitle(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    if (!isRecord(part)) return '';
    if (typeof part.plain_text === 'string') return part.plain_text;
    if (isRecord(part.text) && typeof part.text.content === 'string') return part.text.content;
    return '';
  }).join('').trim();
}

function dateKey(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isFinite(parsed.getTime()) ? tokyoDateKey(parsed) : null;
}

function tokyoDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function latestDate(values: Array<string | null>): string | null {
  const dates = values.filter((value): value is string => Boolean(value)).sort();
  return dates.at(-1) ?? null;
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000);
}

function isFreshTimestamp(value: string | null, now: Date, maxAgeDays: number): boolean {
  const valueDate = dateKey(value);
  if (!valueDate) return false;
  const age = daysBetween(valueDate, tokyoDateKey(now));
  return age >= 0 && age <= maxAgeDays;
}

function compareNullableDate(left: string | null, right: string | null): number {
  if (left && right) return left.localeCompare(right);
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function normalizeId(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[a-f0-9-]{32,36}$/iu.test(normalized) || normalized.replaceAll('-', '').length !== 32) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
