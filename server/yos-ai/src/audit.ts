import type {YosAnswer} from './types.js';

export interface AnswerAuditRecord {
  schemaVersion: '1.0';
  requestId: string;
  createdAt: string;
  subjectHash: string;
  domain: YosAnswer['route']['primary'];
  relatedDomains: YosAnswer['route']['related'];
  liveMode: boolean;
  sourceSnapshots: Array<{
    sourceId: string;
    modifiedAt?: string;
  }>;
  conflictKeys: string[];
  unknownCount: number;
  memoryCandidateCount: number;
  safetyLevel: YosAnswer['safety']['level'];
  durationMilliseconds: number;
  modelUsage?: NonNullable<YosAnswer['modelUsage']>;
}

export interface AuditSink {
  append(record: AnswerAuditRecord): Promise<void>;
}

export function createAnswerAuditRecord(input: {
  answer: YosAnswer;
  subjectHash: string;
  createdAt: string;
  durationMilliseconds: number;
}): AnswerAuditRecord {
  if (!input.subjectHash.trim()) throw new Error('subjectHash is required');
  if (Number.isNaN(Date.parse(input.createdAt))) throw new Error('createdAt must be ISO-8601 compatible');
  if (!Number.isSafeInteger(input.durationMilliseconds) || input.durationMilliseconds < 0) {
    throw new Error('durationMilliseconds must be a non-negative safe integer');
  }

  return {
    schemaVersion: '1.0',
    requestId: input.answer.requestId,
    createdAt: input.createdAt,
    subjectHash: input.subjectHash,
    domain: input.answer.route.primary,
    relatedDomains: [...input.answer.route.related],
    liveMode: input.answer.route.liveMode,
    sourceSnapshots: input.answer.sources.map((source) => ({
      sourceId: source.id,
      ...(source.modifiedAt ? {modifiedAt: source.modifiedAt} : {})
    })),
    conflictKeys: input.answer.conflicts.map((conflict) => conflict.key),
    unknownCount: input.answer.unknowns.length,
    memoryCandidateCount: input.answer.memoryCandidates.length,
    safetyLevel: input.answer.safety.level,
    durationMilliseconds: input.durationMilliseconds,
    ...(input.answer.modelUsage ? {modelUsage: input.answer.modelUsage} : {})
  };
}
