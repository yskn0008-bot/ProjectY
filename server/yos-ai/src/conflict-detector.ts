import type { Conflict, EvidenceItem } from './types.js';

function normalizedValue(value: EvidenceItem['value']): string {
  return value === null ? 'null' : String(value).trim().toLowerCase();
}

function evidenceWeight(item: EvidenceItem): number {
  const statusWeight: Record<EvidenceItem['status'], number> = {
    confirmed: 0,
    superseded: 10,
    candidate: 20,
    temporary: 30,
    hypothesis: 40,
    unknown: 50,
    rejected: 60
  };
  return item.source.priority * 100 + statusWeight[item.status];
}

export function detectConflicts(items: EvidenceItem[]): Conflict[] {
  const groups = new Map<string, EvidenceItem[]>();

  for (const item of items) {
    const list = groups.get(item.key) ?? [];
    list.push(item);
    groups.set(item.key, list);
  }

  const conflicts: Conflict[] = [];
  for (const [key, group] of groups) {
    const active = group.filter((item) => !['rejected', 'superseded', 'unknown'].includes(item.status));
    const values = new Set(active.map((item) => normalizedValue(item.value)));
    if (values.size <= 1) continue;

    const sorted = [...active].sort((a, b) => evidenceWeight(a) - evidenceWeight(b));
    const selected = sorted[0];
    if (!selected) continue;

    conflicts.push({
      key,
      selected,
      alternatives: sorted.slice(1),
      reason: '複数の有効な情報源で値が一致しないため、優先順位の高い情報を暫定選択'
    });
  }

  return conflicts;
}
