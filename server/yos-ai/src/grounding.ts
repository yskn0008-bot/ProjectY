import type {GroundedFact, SourceRef} from './types.js';

export interface GroundedFactValidationResult {
  accepted: GroundedFact[];
  rejected: Array<{index: number; reason: string}>;
}

export interface GroundedFactValidationOptions {
  maxFacts?: number;
  maxTextCharacters?: number;
  maxSourcesPerFact?: number;
}

export function validateGroundedFacts(
  facts: GroundedFact[],
  sources: SourceRef[],
  options: GroundedFactValidationOptions = {}
): GroundedFactValidationResult {
  const maxFacts = options.maxFacts ?? 30;
  const maxTextCharacters = options.maxTextCharacters ?? 500;
  const maxSourcesPerFact = options.maxSourcesPerFact ?? 8;
  const knownSources = new Set(sources.map((source) => source.id));
  const accepted: GroundedFact[] = [];
  const rejected: Array<{index: number; reason: string}> = [];

  for (const [index, fact] of facts.entries()) {
    if (index >= maxFacts) {
      rejected.push({index, reason: `事実は最大${maxFacts}件`});
      continue;
    }
    const text = fact.text.trim();
    if (!text || text.length > maxTextCharacters) {
      rejected.push({index, reason: `事実本文は1〜${maxTextCharacters}文字`});
      continue;
    }
    const sourceIds = [...new Set(fact.sourceIds)];
    if (sourceIds.length === 0) {
      rejected.push({index, reason: '事実に根拠情報源がない'});
      continue;
    }
    if (sourceIds.length > maxSourcesPerFact) {
      rejected.push({index, reason: `1事実の根拠は最大${maxSourcesPerFact}件`});
      continue;
    }
    const unknownSource = sourceIds.find((sourceId) => !knownSources.has(sourceId));
    if (unknownSource) {
      rejected.push({index, reason: `未知の根拠情報源:${unknownSource}`});
      continue;
    }
    accepted.push({text, sourceIds});
  }

  return {accepted, rejected};
}
