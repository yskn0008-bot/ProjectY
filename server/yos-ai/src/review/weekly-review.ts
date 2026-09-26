export type WeeklyReviewDomain = 'myway' | 'life' | 'money' | 'hj' | 'idea' | 'yos' | 'other';
export type WeeklyReviewOutcome = 'positive' | 'neutral' | 'negative' | 'unknown';
export type WeeklyReviewValue = 'high' | 'medium' | 'low' | 'unknown';
export type WeeklyReviewFriction = 'high' | 'medium' | 'low' | 'none' | 'unknown';
export type WeeklyReviewDecision = 'continue' | 'stop' | 'automate';

export interface WeeklyReviewSignal {
  id: string;
  domain: WeeklyReviewDomain;
  label: string;
  occurrences: number;
  outcome: WeeklyReviewOutcome;
  value: WeeklyReviewValue;
  friction: WeeklyReviewFriction;
  automatable: boolean;
  reversible: boolean;
  measuredMinutesPerWeek: number | null;
  manualStepsPerWeek: number | null;
  evidenceIds: readonly string[];
}

export interface WeeklyReviewCandidate {
  id: string;
  decision: WeeklyReviewDecision;
  domain: WeeklyReviewDomain;
  label: string;
  reason: string;
  score: number;
  estimatedMinutesPerWeek: number | null;
  manualStepsPerWeek: number | null;
  evidenceIds: string[];
  requiresUserDecision: true;
}

export interface WeeklyReviewResult {
  schemaVersion: 1;
  sourceSignalCount: number;
  continue: WeeklyReviewCandidate[];
  stop: WeeklyReviewCandidate[];
  automate: WeeklyReviewCandidate[];
}

export interface WeeklyReviewOptions {
  maxPerCategory?: number;
  automateMinOccurrences?: number;
  automateMinMinutesPerWeek?: number;
  automateMinManualStepsPerWeek?: number;
  stopMinOccurrences?: number;
}

const DEFAULTS = {
  maxPerCategory: 3,
  automateMinOccurrences: 3,
  automateMinMinutesPerWeek: 5,
  automateMinManualStepsPerWeek: 10,
  stopMinOccurrences: 2
} as const;

function finiteNonNegative(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function normalizedOccurrences(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function impactScore(minutes: number | null, steps: number | null): number {
  const minutePoints = minutes === null ? 0 : Math.min(30, minutes);
  const stepPoints = steps === null ? 0 : Math.min(20, steps / 2);
  return minutePoints + stepPoints;
}

function sortCandidates(candidates: WeeklyReviewCandidate[]): WeeklyReviewCandidate[] {
  return candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'ja') || a.id.localeCompare(b.id));
}

function makeCandidate(
  signal: WeeklyReviewSignal,
  decision: WeeklyReviewDecision,
  reason: string,
  score: number
): WeeklyReviewCandidate {
  return {
    id: signal.id,
    decision,
    domain: signal.domain,
    label: signal.label.trim(),
    reason,
    score: Math.round(score * 10) / 10,
    estimatedMinutesPerWeek: finiteNonNegative(signal.measuredMinutesPerWeek),
    manualStepsPerWeek: finiteNonNegative(signal.manualStepsPerWeek),
    evidenceIds: [...new Set(signal.evidenceIds.filter(Boolean))],
    requiresUserDecision: true
  };
}

export function buildWeeklyReview(
  signals: readonly WeeklyReviewSignal[],
  options: WeeklyReviewOptions = {}
): WeeklyReviewResult {
  const maxPerCategory = Math.max(1, Math.floor(options.maxPerCategory ?? DEFAULTS.maxPerCategory));
  const automateMinOccurrences = Math.max(1, Math.floor(options.automateMinOccurrences ?? DEFAULTS.automateMinOccurrences));
  const automateMinMinutesPerWeek = Math.max(0, options.automateMinMinutesPerWeek ?? DEFAULTS.automateMinMinutesPerWeek);
  const automateMinManualStepsPerWeek = Math.max(0, options.automateMinManualStepsPerWeek ?? DEFAULTS.automateMinManualStepsPerWeek);
  const stopMinOccurrences = Math.max(1, Math.floor(options.stopMinOccurrences ?? DEFAULTS.stopMinOccurrences));

  const buckets: Record<WeeklyReviewDecision, WeeklyReviewCandidate[]> = {
    continue: [],
    stop: [],
    automate: []
  };

  for (const signal of signals) {
    const label = signal.label.trim();
    const occurrences = normalizedOccurrences(signal.occurrences);
    if (!signal.id || !label || occurrences === 0 || signal.evidenceIds.length === 0) continue;

    const minutes = finiteNonNegative(signal.measuredMinutesPerWeek);
    const steps = finiteNonNegative(signal.manualStepsPerWeek);
    const frictionWeight = signal.friction === 'high' ? 15 : signal.friction === 'medium' ? 8 : 0;
    const valueWeight = signal.value === 'high' ? 20 : signal.value === 'medium' ? 10 : 0;
    const outcomeWeight = signal.outcome === 'positive' ? 20 : signal.outcome === 'negative' ? 10 : 0;

    const stopCandidate =
      signal.value === 'low' &&
      (signal.outcome === 'negative' || signal.outcome === 'neutral') &&
      (signal.friction === 'high' || signal.friction === 'medium') &&
      occurrences >= stopMinOccurrences;

    if (stopCandidate) {
      buckets.stop.push(makeCandidate(
        signal,
        'stop',
        '価値が低く、負担が繰り返し発生しているため、続ける前提を外す候補です。',
        50 + frictionWeight + outcomeWeight + Math.min(15, occurrences * 2) + impactScore(minutes, steps)
      ));
      continue;
    }

    const measurableAutomationImpact =
      (minutes !== null && minutes >= automateMinMinutesPerWeek) ||
      (steps !== null && steps >= automateMinManualStepsPerWeek);
    const automateCandidate =
      signal.automatable &&
      signal.reversible &&
      measurableAutomationImpact &&
      (signal.friction === 'high' || signal.friction === 'medium') &&
      occurrences >= automateMinOccurrences;

    if (automateCandidate) {
      buckets.automate.push(makeCandidate(
        signal,
        'automate',
        '繰り返し回数と負担が閾値を超え、低リスクに置き換えられるため自動化候補です。',
        45 + frictionWeight + Math.min(20, occurrences * 2) + impactScore(minutes, steps)
      ));
      continue;
    }

    const continueCandidate =
      signal.outcome === 'positive' &&
      (signal.value === 'high' || signal.value === 'medium');

    if (continueCandidate) {
      buckets.continue.push(makeCandidate(
        signal,
        'continue',
        '今週の結果と価値が確認できているため、継続候補です。',
        35 + valueWeight + outcomeWeight + Math.min(15, occurrences * 2)
      ));
    }
  }

  return {
    schemaVersion: 1,
    sourceSignalCount: signals.length,
    continue: sortCandidates(buckets.continue).slice(0, maxPerCategory),
    stop: sortCandidates(buckets.stop).slice(0, maxPerCategory),
    automate: sortCandidates(buckets.automate).slice(0, maxPerCategory)
  };
}
