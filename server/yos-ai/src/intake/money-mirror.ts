import type {NotionMirrorInput} from './mirror-handler.js';

type ShadowTx = {
  date?: unknown;
  label?: unknown;
  amount?: unknown;
};

export type MoneyShadowSnapshot = {
  updated_at?: unknown;
  privacy?: unknown;
  balance?: unknown;
  today_usable?: unknown;
  next_payment?: ShadowTx | null;
  next_income?: ShadowTx | null;
  shortage_after_next_payment?: unknown;
  shortfall_after_next_payment?: unknown;
  shortage_possible?: unknown;
  shortfall?: unknown;
};

const MONEY_URL = 'https://yskn0008-bot.github.io/ProjectY/yos/';

export function moneyShadowToMirrorInput(snapshot: MoneyShadowSnapshot, now = new Date()): NotionMirrorInput {
  const updatedAt = validDate(snapshot.updated_at) ?? now.toISOString();
  const privacy = snapshot.privacy === true;
  const nextPayment = tx(snapshot.next_payment);
  const nextIncome = tx(snapshot.next_income);
  const shortage = snapshot.shortage_possible === true || snapshot.shortage_after_next_payment === true;
  const shortfall = numberValue(snapshot.shortfall) ?? numberValue(snapshot.shortfall_after_next_payment);
  const todayUsable = numberValue(snapshot.today_usable);
  const balance = numberValue(snapshot.balance);

  const nextActionParts: string[] = [];
  if (!privacy && todayUsable !== null) nextActionParts.push(`今日使える：${yen(todayUsable)}`);
  else if (!privacy && balance !== null) nextActionParts.push(`現在残高：${yen(balance)}`);
  if (nextPayment) nextActionParts.push(`次の支払い：${displayTx(nextPayment, privacy)}`);
  if (nextIncome) nextActionParts.push(`次の入金：${displayTx(nextIncome, privacy)}`);
  if (!nextActionParts.length) nextActionParts.push('Moneyを開いて現在地を確認');

  const blocker = shortage
    ? (!privacy && shortfall !== null ? `不足見込み：${yen(shortfall)}` : '資金不足の可能性あり')
    : null;

  return {
    eventId: `money-shadow:${identifierPart(updatedAt)}`,
    syncedAt: updatedAt,
    source: 'money-shadow',
    items: [{
      syncKey: 'money:current',
      title: 'Money 現在地',
      area: 'Money',
      priority: shortage ? 'P0' : 'P2',
      status: shortage ? '本人操作' : '保留',
      kind: 'Task',
      owner: shortage ? '陽介' : 'YOS',
      nextAction: nextActionParts.join(' / '),
      blocker,
      sourceRef: `Money Shadow:${updatedAt}`,
      actionUrl: MONEY_URL,
      dueAt: nextPayment?.date ?? null
    }]
  };
}

function tx(value: ShadowTx | null | undefined): {date: string | null; label: string; amount: number | null} | null {
  if (!value || typeof value !== 'object') return null;
  const date = typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value.date) ? value.date : null;
  const label = typeof value.label === 'string' ? value.label.trim().slice(0, 80) : '';
  const amount = numberValue(value.amount);
  if (!date && !label && amount === null) return null;
  return {date, label, amount};
}

function displayTx(value: {date: string | null; label: string; amount: number | null}, privacy: boolean): string {
  const parts = [];
  if (value.date) parts.push(value.date.slice(5).replace('-', '/'));
  if (value.label) parts.push(value.label);
  if (!privacy && value.amount !== null) parts.push(yen(value.amount));
  return parts.join(' ') || '未確認';
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function yen(value: number): string {
  return `${Math.round(value).toLocaleString('ja-JP')}円`;
}

function validDate(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 80 && Number.isFinite(Date.parse(value)) ? value : null;
}

function identifierPart(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._:/-]+/gu, '-').replace(/-+/gu, '-');
  return normalized.slice(0, 120) || 'unknown';
}
