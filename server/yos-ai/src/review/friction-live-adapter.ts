import {
  discoverFrictionCandidates,
  type FrictionDiscoveryOptions,
  type FrictionDiscoveryResult,
  type FrictionKind,
  type FrictionSignal
} from './friction-discovery.js';

type UnknownRecord = Record<string, unknown>;

export interface LifeFrictionDiscoveryResult {
  signals: FrictionSignal[];
  result: FrictionDiscoveryResult;
}

const READ_ONLY_ACTION = /(確認|チェック|照合|開く|起動|検索)/u;
const UNSAFE_ACTION = /(支払|振込|送信|削除|購入|契約|決済|投稿|公開|登録|予約|注文|入金|出金|変更|更新|保存|入力|転記|同期)/u;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function asObject(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function clean(value: unknown, max = 120): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, max);
}

function patternKey(label: string): string {
  return `life-task:${label.toLocaleLowerCase('ja-JP')}`;
}

function frictionKind(label: string): FrictionKind {
  return /(確認|チェック|照合|検索)/u.test(label) ? 'repeated_check' : 'repeated_action';
}

export function projectLifeStoreToFrictionSignals(store: unknown): FrictionSignal[] {
  const days = asObject(asObject(store).days);
  const signals: FrictionSignal[] = [];

  for (const date of Object.keys(days).sort()) {
    if (!ISO_DAY.test(date)) continue;
    const day = asObject(days[date]);
    const tasks = Array.isArray(day.tasks) ? day.tasks : [];

    tasks.forEach((rawTask, index) => {
      const task = asObject(rawTask);
      const label = clean(task.text);
      if (!label || task.done !== true) return;
      if (!READ_ONLY_ACTION.test(label)) return;
      if (UNSAFE_ACTION.test(label)) return;

      const evidenceId = `life:${date}:task:${index}`;
      signals.push({
        id: evidenceId,
        occurredAt: `${date}T12:00:00+09:00`,
        source: 'life',
        patternKey: patternKey(label),
        label,
        kind: frictionKind(label),
        minutesSpent: null,
        manualSteps: 1,
        automatable: true,
        reversible: true,
        risk: 'low',
        evidenceId
      });
    });
  }

  return signals;
}

export function discoverFrictionFromLifeStore(
  store: unknown,
  options: FrictionDiscoveryOptions = {}
): LifeFrictionDiscoveryResult {
  const signals = projectLifeStoreToFrictionSignals(store);
  return {
    signals,
    result: discoverFrictionCandidates(signals, options)
  };
}
