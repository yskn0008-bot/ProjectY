export type FrictionSource = 'clarity' | 'myway' | 'life' | 'idea' | 'yos' | 'automation' | 'other';
export type FrictionKind = 'repeated_action' | 'repeated_check' | 'hesitation' | 'manual_step' | 'recovery';
export type FrictionRisk = 'low' | 'medium' | 'high' | 'unknown';

export interface FrictionSignal {
  id: string;
  occurredAt: string;
  source: FrictionSource;
  patternKey: string;
  label: string;
  kind: FrictionKind;
  minutesSpent: number | null;
  manualSteps: number | null;
  automatable: boolean;
  reversible: boolean;
  risk: FrictionRisk;
  evidenceId: string;
}

export interface FrictionCandidate {
  patternKey: string;
  label: string;
  kind: FrictionKind;
  occurrences: number;
  distinctDays: number;
  estimatedMinutesPerWeek: number | null;
  manualStepsPerWeek: number | null;
  score: number;
  confidence: 'medium' | 'high';
  evidenceIds: string[];
  sources: FrictionSource[];
  handoff: 'prototype';
  requiresUserDecision: true;
}

export interface FrictionDiscoveryResult {
  schemaVersion: 1;
  windowDays: number;
  consideredSignals: number;
  candidates: FrictionCandidate[];
}

export interface FrictionDiscoveryOptions {
  now?: string;
  windowDays?: number;
  minOccurrences?: number;
  minDistinctDays?: number;
  minMinutesPerWeek?: number;
  minManualStepsPerWeek?: number;
  maxCandidates?: number;
}

const DEFAULTS = {
  windowDays: 14,
  minOccurrences: 3,
  minDistinctDays: 2,
  minMinutesPerWeek: 3,
  minManualStepsPerWeek: 8,
  maxCandidates: 5
} as const;

function finiteNonNegative(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function isoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeKey(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function scoreCandidate(minutesPerWeek: number | null, stepsPerWeek: number | null, occurrences: number, distinctDays: number): number {
  const minutePoints = minutesPerWeek === null ? 0 : Math.min(40, minutesPerWeek * 2);
  const stepPoints = stepsPerWeek === null ? 0 : Math.min(30, stepsPerWeek);
  return Math.round((minutePoints + stepPoints + Math.min(24, occurrences * 4) + Math.min(12, distinctDays * 3)) * 10) / 10;
}

function mostCommonKind(signals: readonly FrictionSignal[]): FrictionKind {
  const counts = new Map<FrictionKind, number>();
  for (const signal of signals) counts.set(signal.kind, (counts.get(signal.kind) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? 'repeated_action';
}

export function discoverFrictionCandidates(
  signals: readonly FrictionSignal[],
  options: FrictionDiscoveryOptions = {}
): FrictionDiscoveryResult {
  const windowDays = Math.max(1, Math.floor(options.windowDays ?? DEFAULTS.windowDays));
  const minOccurrences = Math.max(2, Math.floor(options.minOccurrences ?? DEFAULTS.minOccurrences));
  const minDistinctDays = Math.max(1, Math.floor(options.minDistinctDays ?? DEFAULTS.minDistinctDays));
  const minMinutesPerWeek = Math.max(0, options.minMinutesPerWeek ?? DEFAULTS.minMinutesPerWeek);
  const minManualStepsPerWeek = Math.max(0, options.minManualStepsPerWeek ?? DEFAULTS.minManualStepsPerWeek);
  const maxCandidates = Math.max(1, Math.floor(options.maxCandidates ?? DEFAULTS.maxCandidates));
  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  if (!Number.isFinite(nowMs)) throw new Error('options.now must be a valid ISO date');

  const windowStart = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const groups = new Map<string, FrictionSignal[]>();
  let consideredSignals = 0;

  for (const signal of signals) {
    const occurredAt = Date.parse(signal.occurredAt);
    const key = normalizeKey(signal.patternKey);
    const label = signal.label.trim();
    if (!Number.isFinite(occurredAt) || occurredAt < windowStart || occurredAt > nowMs || !signal.id || !signal.evidenceId || !key || !label) continue;
    consideredSignals += 1;
    const group = groups.get(key) ?? [];
    group.push(signal);
    groups.set(key, group);
  }

  const candidates: FrictionCandidate[] = [];
  const weekScale = 7 / windowDays;

  for (const [patternKey, group] of groups) {
    if (group.length < minOccurrences) continue;

    const distinctDays = new Set(group.map((signal) => isoDay(Date.parse(signal.occurredAt)))).size;
    if (distinctDays < minDistinctDays) continue;

    const safeForPrototype = group.every((signal) => signal.automatable && signal.reversible && signal.risk === 'low');
    if (!safeForPrototype) continue;

    const knownMinutes = group.map((signal) => finiteNonNegative(signal.minutesSpent)).filter((value): value is number => value !== null);
    const knownSteps = group.map((signal) => finiteNonNegative(signal.manualSteps)).filter((value): value is number => value !== null);
    const minutesPerWeek = knownMinutes.length === 0 ? null : Math.round(knownMinutes.reduce((sum, value) => sum + value, 0) * weekScale * 10) / 10;
    const stepsPerWeek = knownSteps.length === 0 ? null : Math.round(knownSteps.reduce((sum, value) => sum + value, 0) * weekScale * 10) / 10;
    const measurableImpact =
      (minutesPerWeek !== null && minutesPerWeek >= minMinutesPerWeek) ||
      (stepsPerWeek !== null && stepsPerWeek >= minManualStepsPerWeek);
    if (!measurableImpact) continue;

    const labels = new Map<string, number>();
    for (const signal of group) labels.set(signal.label.trim(), (labels.get(signal.label.trim()) ?? 0) + 1);
    const label = [...labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))[0]?.[0] ?? patternKey;
    const score = scoreCandidate(minutesPerWeek, stepsPerWeek, group.length, distinctDays);
    const confidence: 'medium' | 'high' =
      group.length >= 5 && distinctDays >= 3 && ((minutesPerWeek ?? 0) >= 5 || (stepsPerWeek ?? 0) >= 12)
        ? 'high'
        : 'medium';

    candidates.push({
      patternKey,
      label,
      kind: mostCommonKind(group),
      occurrences: group.length,
      distinctDays,
      estimatedMinutesPerWeek: minutesPerWeek,
      manualStepsPerWeek: stepsPerWeek,
      score,
      confidence,
      evidenceIds: [...new Set(group.map((signal) => signal.evidenceId))],
      sources: [...new Set(group.map((signal) => signal.source))].sort(),
      handoff: 'prototype',
      requiresUserDecision: true
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.occurrences - a.occurrences || a.patternKey.localeCompare(b.patternKey));

  return {
    schemaVersion: 1,
    windowDays,
    consideredSignals,
    candidates: candidates.slice(0, maxCandidates)
  };
}
