import type {MemoryCandidate, SourceRef, YosDomain} from './types.js';

export interface MemoryCandidateValidationResult {
  accepted: MemoryCandidate[];
  rejected: Array<{index: number; reason: string}>;
}

export interface MemoryCandidateValidationOptions {
  maxCandidates?: number;
  maxContentCharacters?: number;
}

export function validateMemoryCandidates(
  candidates: MemoryCandidate[],
  sources: SourceRef[],
  routeDomains: YosDomain[],
  options: MemoryCandidateValidationOptions = {}
): MemoryCandidateValidationResult {
  const maxCandidates = options.maxCandidates ?? 10;
  const maxContentCharacters = options.maxContentCharacters ?? 500;
  const knownSources = new Set(sources.map((source) => source.id));
  const allowedDomains = new Set(routeDomains);
  const accepted: MemoryCandidate[] = [];
  const rejected: Array<{index: number; reason: string}> = [];

  for (const [index, candidate] of candidates.entries()) {
    if (index >= maxCandidates) {
      rejected.push({index, reason: `保存候補は最大${maxCandidates}件`});
      continue;
    }
    const content = candidate.content.trim();
    if (!content || content.length > maxContentCharacters) {
      rejected.push({index, reason: `保存候補本文は1〜${maxContentCharacters}文字`});
      continue;
    }
    if (candidate.status !== 'candidate') {
      rejected.push({index, reason: '承認前の状態はcandidateだけ許可'});
      continue;
    }
    if (candidate.privacyLevel === 'L4') {
      rejected.push({index, reason: 'L4秘密情報は保存候補にできない'});
      continue;
    }
    if (!allowedDomains.has(candidate.domain)) {
      rejected.push({index, reason: '質問と無関係な領域の保存候補'});
      continue;
    }
    if (candidate.evidenceSourceIds.length === 0) {
      rejected.push({index, reason: '保存候補に根拠がない'});
      continue;
    }
    const unknownSource = candidate.evidenceSourceIds.find((sourceId) => !knownSources.has(sourceId));
    if (unknownSource) {
      rejected.push({index, reason: `未知の根拠情報源:${unknownSource}`});
      continue;
    }

    accepted.push({
      ...candidate,
      content,
      evidenceSourceIds: [...new Set(candidate.evidenceSourceIds)]
    });
  }

  return {accepted, rejected};
}
