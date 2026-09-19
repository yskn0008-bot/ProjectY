import type {EvidenceStatus, SourceRef} from './types.js';

export const POINT_EVENT_SOURCE_SYSTEMS = [
  'yos-capture',
  'hj',
  'taxi',
  'life',
  'life-stream',
  'morning',
  'night',
  'notification',
  'other'
] as const;

export type PointEventSourceSystem = (typeof POINT_EVENT_SOURCE_SYSTEMS)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {[key: string]: JsonValue};

export type PointEventRaw =
  | {mode: 'snapshot'; value: JsonValue}
  | {mode: 'reference'; ref: string};

export interface PointEventRefV1 {
  schemaVersion: 1;
  pointId: string;
  sourceSystem: PointEventSourceSystem;
  sourceRecordId: string | null;
  capturedAt: string;
  occurredAt: string | null;
  raw: PointEventRaw;
  status: 'raw';
  provenance: SourceRef;
}

export interface PointEventValidationResult {
  ok: boolean;
  errors: string[];
  value?: PointEventRefV1;
}

export interface YosCapturePointInput {
  captureID: string;
  rawText: string;
  capturedAt: string;
  occurredAt?: string | null;
}

export interface TaxiEventPointInput {
  eventId: string;
  capturedAt: string;
  payload: JsonValue;
  occurredAt?: string | null;
}

export interface HjRawInputPointInput {
  sceneId: string;
  rawInput: string;
  capturedAt: string;
  occurredAt?: string | null;
}

export interface LifeSnapshotPointInput {
  snapshotId: string;
  capturedAt: string;
  snapshot: JsonValue;
  occurredAt?: string | null;
}

export interface LinkCandidateV1 {
  schemaVersion: 1;
  linkId: string;
  relation: 'related' | 'causal';
  status: EvidenceStatus;
  pointIds: string[];
  evidencePointIds: string[];
  userConfirmedAt: string | null;
}

export type RuleLifecycleStatus =
  | 'candidate'
  | 'user_approved_active'
  | 'disabled'
  | 'superseded';

export interface RuleCandidateV1 {
  schemaVersion: 1;
  ruleId: string;
  version: number;
  status: RuleLifecycleStatus;
  evidencePointIds: string[];
  userApproval: {
    approvedAt: string;
    approvalRef: string;
  } | null;
}

export interface GateValidationResult {
  ok: boolean;
  reasons: string[];
}

const SOURCE_REF_KINDS = new Set([
  'law',
  'master',
  'change-log',
  'code',
  'sheet',
  'original',
  'web',
  'memory'
]);
const SOURCE_SYSTEM_SET = new Set<string>(POINT_EVENT_SOURCE_SYSTEMS);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item));
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((item) => isJsonValue(item));
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (!isJsonValue(value)) {
    throw new Error('raw snapshot must be JSON-safe');
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneSourceRef(source: SourceRef): SourceRef {
  return {...source};
}

function assertSourceRef(source: SourceRef): void {
  if (!isNonEmptyString(source.id)) throw new Error('provenance.id is required');
  if (!isNonEmptyString(source.title)) throw new Error('provenance.title is required');
  if (!SOURCE_REF_KINDS.has(source.kind)) throw new Error('provenance.kind is invalid');
  if (!Number.isFinite(source.priority)) throw new Error('provenance.priority is invalid');
}

function assertOwnedRecordIdentity(sourceRecordId: string, capturedAt: string): void {
  if (!isNonEmptyString(sourceRecordId)) throw new Error('sourceRecordId is required');
  if (!isNonEmptyString(capturedAt)) throw new Error('capturedAt is required');
}

function normalizeOccurredAt(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (!isNonEmptyString(value)) throw new Error('occurredAt must be a non-empty string or null');
  return value;
}

export function makePointId(
  sourceSystem: PointEventSourceSystem,
  sourceRecordId: string
): string {
  if (!SOURCE_SYSTEM_SET.has(sourceSystem)) throw new Error('sourceSystem is invalid');
  if (!isNonEmptyString(sourceRecordId)) throw new Error('sourceRecordId is required');
  return `pe:v1:${sourceSystem}:${encodeURIComponent(sourceRecordId)}`;
}

function fromOwnedSnapshot(
  sourceSystem: PointEventSourceSystem,
  sourceRecordId: string,
  capturedAt: string,
  occurredAt: string | null | undefined,
  raw: JsonValue,
  provenance: SourceRef
): PointEventRefV1 {
  assertOwnedRecordIdentity(sourceRecordId, capturedAt);
  assertSourceRef(provenance);

  return {
    schemaVersion: 1,
    pointId: makePointId(sourceSystem, sourceRecordId),
    sourceSystem,
    sourceRecordId,
    capturedAt,
    occurredAt: normalizeOccurredAt(occurredAt),
    raw: {mode: 'snapshot', value: cloneJson(raw)},
    status: 'raw',
    provenance: cloneSourceRef(provenance)
  };
}

export function createReferencedPointEvent(input: {
  pointId: string;
  sourceSystem: PointEventSourceSystem;
  sourceRecordId: string | null;
  capturedAt: string;
  occurredAt?: string | null;
  ref: string;
  provenance: SourceRef;
}): PointEventRefV1 {
  if (!isNonEmptyString(input.pointId)) throw new Error('pointId is required');
  if (!SOURCE_SYSTEM_SET.has(input.sourceSystem)) throw new Error('sourceSystem is invalid');
  if (input.sourceRecordId !== null && !isNonEmptyString(input.sourceRecordId)) {
    throw new Error('sourceRecordId must be a non-empty string or null');
  }
  if (!isNonEmptyString(input.capturedAt)) throw new Error('capturedAt is required');
  if (!isNonEmptyString(input.ref)) throw new Error('raw reference is required');
  assertSourceRef(input.provenance);

  return {
    schemaVersion: 1,
    pointId: input.pointId,
    sourceSystem: input.sourceSystem,
    sourceRecordId: input.sourceRecordId,
    capturedAt: input.capturedAt,
    occurredAt: normalizeOccurredAt(input.occurredAt),
    raw: {mode: 'reference', ref: input.ref},
    status: 'raw',
    provenance: cloneSourceRef(input.provenance)
  };
}

export function mapYosCaptureToPointEvent(
  input: YosCapturePointInput,
  provenance: SourceRef
): PointEventRefV1 {
  return fromOwnedSnapshot(
    'yos-capture',
    input.captureID,
    input.capturedAt,
    input.occurredAt,
    input.rawText,
    provenance
  );
}

export function mapTaxiEventToPointEvent(
  input: TaxiEventPointInput,
  provenance: SourceRef
): PointEventRefV1 {
  return fromOwnedSnapshot(
    'taxi',
    input.eventId,
    input.capturedAt,
    input.occurredAt,
    input.payload,
    provenance
  );
}

export function mapHjRawInputToPointEvent(
  input: HjRawInputPointInput,
  provenance: SourceRef
): PointEventRefV1 {
  return fromOwnedSnapshot(
    'hj',
    input.sceneId,
    input.capturedAt,
    input.occurredAt,
    input.rawInput,
    provenance
  );
}

export function mapLifeSnapshotToPointEvent(
  input: LifeSnapshotPointInput,
  provenance: SourceRef
): PointEventRefV1 {
  return fromOwnedSnapshot(
    'life',
    input.snapshotId,
    input.capturedAt,
    input.occurredAt,
    input.snapshot,
    provenance
  );
}

function isSourceRef(value: unknown): value is SourceRef {
  if (!isPlainObject(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    typeof value.kind === 'string' &&
    SOURCE_REF_KINDS.has(value.kind) &&
    typeof value.priority === 'number' &&
    Number.isFinite(value.priority) &&
    (value.modifiedAt === undefined || typeof value.modifiedAt === 'string') &&
    (value.locator === undefined || typeof value.locator === 'string')
  );
}

function isPointEventRaw(value: unknown): value is PointEventRaw {
  if (!isPlainObject(value) || value.mode === undefined) return false;
  if (value.mode === 'snapshot') {
    return Object.keys(value).every((key) => key === 'mode' || key === 'value') && isJsonValue(value.value);
  }
  if (value.mode === 'reference') {
    return (
      Object.keys(value).every((key) => key === 'mode' || key === 'ref') &&
      isNonEmptyString(value.ref)
    );
  }
  return false;
}

export function validatePointEventRef(value: unknown): PointEventValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(value)) return {ok: false, errors: ['point event must be an object']};

  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!isNonEmptyString(value.pointId)) errors.push('pointId is required');
  if (typeof value.sourceSystem !== 'string' || !SOURCE_SYSTEM_SET.has(value.sourceSystem)) {
    errors.push('sourceSystem is invalid');
  }
  if (value.sourceRecordId !== null && !isNonEmptyString(value.sourceRecordId)) {
    errors.push('sourceRecordId must be a non-empty string or null');
  }
  if (!isNonEmptyString(value.capturedAt)) errors.push('capturedAt is required');
  if (value.occurredAt !== null && !isNonEmptyString(value.occurredAt)) {
    errors.push('occurredAt must be a non-empty string or null');
  }
  if (!isPointEventRaw(value.raw)) errors.push('raw must be a JSON snapshot or safe reference');
  if (value.status !== 'raw') errors.push('status must remain raw');
  if (!isSourceRef(value.provenance)) errors.push('provenance is invalid');

  if (errors.length > 0) return {ok: false, errors};
  return {ok: true, errors: [], value: value as unknown as PointEventRefV1};
}

export function validateLinkConfirmationGate(link: LinkCandidateV1): GateValidationResult {
  const reasons: string[] = [];
  if (!isNonEmptyString(link.linkId)) reasons.push('linkId is required');
  if (link.schemaVersion !== 1) reasons.push('schemaVersion must be 1');
  if (link.pointIds.length < 2) reasons.push('a link requires at least two pointIds');

  if (link.relation === 'causal' && link.status === 'confirmed') {
    const hasEvidence = link.evidencePointIds.length > 0;
    const hasUserConfirmation = isNonEmptyString(link.userConfirmedAt);
    if (!hasEvidence && !hasUserConfirmation) {
      reasons.push('causal link cannot be confirmed without evidence or user confirmation');
    }
  }

  return {ok: reasons.length === 0, reasons};
}

export function validateRuleLifecycleGate(rule: RuleCandidateV1): GateValidationResult {
  const reasons: string[] = [];
  if (!isNonEmptyString(rule.ruleId)) reasons.push('ruleId is required');
  if (rule.schemaVersion !== 1) reasons.push('schemaVersion must be 1');
  if (!Number.isInteger(rule.version) || rule.version < 1) reasons.push('rule version must be >= 1');

  if (rule.status === 'user_approved_active') {
    if (rule.userApproval === null) {
      reasons.push('active rule requires explicit user approval');
    } else {
      if (!isNonEmptyString(rule.userApproval.approvedAt)) {
        reasons.push('active rule requires user approval time');
      }
      if (!isNonEmptyString(rule.userApproval.approvalRef)) {
        reasons.push('active rule requires user approval reference');
      }
    }
  }

  return {ok: reasons.length === 0, reasons};
}
